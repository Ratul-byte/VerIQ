import { D } from "@/lib/money";
import type { Check, Extraction, Field, PageText } from "@/lib/types";
import { ExtractionSchema } from "@/lib/types";
import { collapse, fullText, locatePage, numbersIn } from "./text-utils";
import { RULES } from "@/lib/rules/config";
import { usable } from "@/lib/rules/util";
import { heuristicExtract } from "./heuristic";

/** "Missing" claims are cross-checked against the raw text; a hit downgrades to "unclear". */
const MISSING_HINTS: Record<string, RegExp> = {
  supplierTin: /\bTIN\b[^\n]{0,30}\d{5,}/i,
  supplierBin: /\bBIN\b[^\n]{0,30}\d[\d-]{5,}/i,
  penalty: /penalt[^.\n]{0,120}\d|\d[^.\n]{0,60}penalt|liquidated damages[^.\n]{0,120}\d/i,
  validity: /valid(?:ity)?[^.\n]{0,80}\d/i,
  delivery: /deliver\w*\s+(?:within|in|period|time|date|by)[^.\n]{0,60}\d/i,
  advancePercent: /advance[^.\n]{0,80}\d|\d+\s*%[^.\n]{0,40}advance/i,
  balancePayment: /(?:balance|remaining)[^.\n]{0,80}\d+\s*days/i,
};

type AnyField = Field<unknown>;

function numericMembers(v: unknown): number[] {
  if (typeof v === "number") return [v];
  if (v && typeof v === "object") {
    return Object.values(v as Record<string, unknown>).filter((x): x is number => typeof x === "number");
  }
  return [];
}

function validDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/** Node 3: schema + grounding + sanity checks. Never trusts an LLM claim it cannot find in the document. */
export function validateExtraction(raw: Extraction, pages: PageText[]): { extraction: Extraction; issues: Check[] } {
  const parsed = ExtractionSchema.safeParse(raw);
  if (!parsed.success) throw new Error("schema");
  const ex: Extraction = structuredClone(parsed.data);
  const issues: Check[] = [];
  const text = fullText(pages);
  const ctext = collapse(text);
  const heuristic = heuristicExtract(pages);
  const validItemId = (value: unknown): value is string =>
    typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value);

  /* PDF table extraction can make a model read JSON punctuation as the item code.
     Repair only from the deterministic parser when the corresponding row is grounded. */
  ex.items.forEach((item, i) => {
    if (item.itemId.status !== "extracted" || validItemId(item.itemId.value)) return;
    const candidate = heuristic.items[i]?.itemId;
    if (candidate?.status === "extracted" && validItemId(candidate.value)) item.itemId = structuredClone(candidate);
  });

  const downgrade = (name: string, f: AnyField, why: string) => {
    f.status = "unclear";
    issues.push({
      id: `extraction_${name}`, group: "extraction", title: `Extraction check: ${name}`, outcome: "review",
      message: why, quote: f.quote, page: f.page, action: "Check this field against the original document.",
    });
  };

  const check = (name: string, f: AnyField) => {
    if (f.status === "extracted") {
      if (f.value === null || f.value === undefined || f.value === "") return downgrade(name, f, "Field marked extracted but has no value.");
      if (!f.quote || !f.quote.trim()) return downgrade(name, f, "No supporting quotation was provided for this value.");
      const cq = collapse(f.quote);
      if (!ctext.includes(cq)) return downgrade(name, f, "The supporting quotation was not found in the document text.");
      f.page = locatePage(pages, f.quote) ?? f.page;
      const nums = numericMembers(f.value);
      if (nums.some((n) => !Number.isFinite(n) || n < 0)) return downgrade(name, f, "Value is negative or not a valid number.");
      if (nums.length) {
        const inQuote = numbersIn(f.quote).map((n) => D(n));
        const allFound = nums.every((n) => inQuote.some((x) => x.eq(n)));
        if (!allFound) return downgrade(name, f, "The extracted number does not appear in its supporting quotation.");
      }
      if (typeof f.value === "string") {
        if (name === "quotationDate") {
          if (!validDate(f.value)) return downgrade(name, f, "Date is not a valid ISO date.");
        } else {
          const strip = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (!strip(f.quote).includes(strip(f.value))) return downgrade(name, f, "Extracted text does not appear in its supporting quotation.");
        }
      }
    } else if (f.status === "missing") {
      const hint = MISSING_HINTS[name];
      if (hint && hint.test(text)) {
        downgrade(name, f, "Marked missing, but the document text appears to contain this information.");
      }
    }
  };

  const top: [string, AnyField][] = [
    ["supplierName", ex.supplierName], ["supplierTin", ex.supplierTin], ["supplierBin", ex.supplierBin],
    ["quotationNumber", ex.quotationNumber], ["quotationDate", ex.quotationDate], ["prReference", ex.prReference],
    ["currency", ex.currency], ["subtotal", ex.subtotal], ["vatPercent", ex.vatPercent], ["vatAmount", ex.vatAmount],
    ["grandTotal", ex.grandTotal], ["advancePercent", ex.advancePercent], ["balancePayment", ex.balancePayment],
    ["delivery", ex.delivery], ["penalty", ex.penalty], ["validity", ex.validity],
  ];
  for (const [n, f] of top) check(n, f);
  ex.items.forEach((it, i) => {
    for (const k of ["itemId", "description", "unit", "quantity", "unitPrice", "lineTotal"] as const) check(`items[${i}].${k}`, it[k]);
  });

  /* A TIN/BIN "value" that holds no digits (e.g. "pending", "N/A") counts as missing. */
  for (const [n, f] of [["supplierTin", ex.supplierTin], ["supplierBin", ex.supplierBin]] as const) {
    if (f.status === "extracted" && typeof f.value === "string" && !/\d/.test(f.value)) {
      f.status = "missing";
      issues.push({
        id: `extraction_${n}`, group: "extraction", title: `Extraction check: ${n}`, outcome: "pass",
        message: `"${f.value}" is a placeholder, not an identification number; treated as missing.`, quote: f.quote, page: f.page,
      });
    }
  }

  /* Currency must be BDT (not assumed when absent). */
  const cur = usable(ex.currency);
  issues.push({
    id: "currency", group: "extraction", title: "Currency is BDT",
    outcome: cur && cur.toUpperCase() === RULES.currency ? "pass" : "review",
    message: cur ? (cur.toUpperCase() === RULES.currency ? "Amounts are in BDT." : `Amounts are in ${cur}, not BDT.`) : "Currency is not clearly stated.",
    expected: RULES.currency, actual: cur ?? "not found", quote: ex.currency.quote, page: ex.currency.page,
    action: "Confirm the currency before comparing prices.",
  });

  return { extraction: ex, issues };
}
