import type { Extraction, Field, PageText } from "@/lib/types";
import { fullText, locatePage } from "./text-utils";

/**
 * Rule-based parser. NOT AI. Used (a) as an independent cross-check of the LLM output and
 * (b) as the offline fallback when no OPENROUTER_API_KEY is configured. It is tuned to the sample
 * quotation layout and returns "missing" whenever a pattern is not found; it never invents values.
 */
export function heuristicExtract(pages: PageText[]): Extraction {
  const text = fullText(pages);
  const num = (s: string) => Number(s.replace(/,/g, ""));

  const found = <T,>(value: T, quote: string): Field<T> => ({
    status: "extracted", value, quote, page: locatePage(pages, quote),
  });
  const none = <T,>(): Field<T> => ({ status: "missing", value: null, quote: null, page: null });
  const m = (re: RegExp) => text.match(re);

  const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const nameMatch = /(ltd|limited|mills|industries|company|co\.|enterprise|traders|corporation|inc)/i.test(firstLine);
  const supplierName: Field<string> = nameMatch ? found(firstLine, firstLine) : none();

  const qn = m(/Quotation\s*(?:no\.?|number|#)\s*:?\s*([A-Z0-9][A-Z0-9\-/]+)/i);
  const qd = m(/Date\s*:?\s*(\d{4}-\d{2}-\d{2})/i);
  const pr = m(/\b(PR-\d{4}-\d+)\b/);
  const tin = m(/\bTIN\s*:?\s*([^\s]+)/i);
  const bin = m(/\bBIN\s*:?\s*([^\s]+)/i);
  const cur = m(/\(BDT\)|\bBDT\b|\bTaka\b|৳/);

  const itemRe = /^([A-Z])\s+(.+?)\s+([\d,]+(?:\.\d+)?)\s+([A-Za-z]+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/gm;
  const items = [...text.matchAll(itemRe)].map((r) => ({
    itemId: found(r[1], r[0].trim()),
    description: found(r[2].trim(), r[0].trim()),
    unit: found(r[4], r[0].trim()),
    quantity: found(num(r[3]), r[0].trim()),
    unitPrice: found(num(r[5]), r[0].trim()),
    lineTotal: found(num(r[6]), r[0].trim()),
  }));

  const sub = m(/^\s*Sub-?total\s+([\d,]+\.\d{2})/im);
  const vat = m(/^\s*VAT\s*(?:@\s*)?(\d+(?:\.\d+)?)\s*%\s+([\d,]+\.\d{2})/im);
  const tot = m(/^\s*(?:Grand\s+)?Total\s+([\d,]+\.\d{2})/im);

  const adv = m(/(\d+(?:\.\d+)?)\s*%\s*advance[^.]*\./i) ?? m(/advance[^.\n]*?(\d+(?:\.\d+)?)\s*%/i);
  const bal = m(/(?:balance|remaining)[^.]*?within\s+(\d+)\s+days\s+(?:after|of|from)\s+(delivery|invoice|[a-z]+)/i);
  const del = m(/deliver(?:y|ed)?\s+within\s+(\d+)\s+(days?|weeks?|months?|working days?)\s+(?:of|from|after)\s+(?:receiving\s+)?(?:the\s+)?(purchase order|PO|order)/i);
  const pen = m(/penalty[^.]*?(\d+(?:\.\d+)?)\s*%\s*of\s+(?:the\s+)?order\s+value[^.]*?(?:per|for each|each|every)\s+(?:full\s+)?(week|day|month)/i);
  const val = m(/valid\s+for\s+(\d+)\s+days/i);

  const unitOf = (s: string): "days" | "weeks" | "months" | "working_days" | "other" => {
    const t = s.toLowerCase();
    if (t.startsWith("working")) return "working_days";
    if (t.startsWith("day")) return "days";
    if (t.startsWith("week")) return "weeks";
    if (t.startsWith("month")) return "months";
    return "other";
  };

  return {
    supplierName,
    supplierTin: tin ? found(tin[1], tin[0]) : none(),
    supplierBin: bin ? found(bin[1], bin[0]) : none(),
    quotationNumber: qn ? found(qn[1], qn[0]) : none(),
    quotationDate: qd ? found(qd[1], qd[0]) : none(),
    prReference: pr ? found(pr[1], pr[0]) : none(),
    currency: cur ? found("BDT", cur[0]) : none(),
    items,
    subtotal: sub ? found(num(sub[1]), sub[0].trim()) : none(),
    vatPercent: vat ? found(Number(vat[1]), vat[0].trim()) : none(),
    vatAmount: vat ? found(num(vat[2]), vat[0].trim()) : none(),
    grandTotal: tot ? found(num(tot[1]), tot[0].trim()) : none(),
    advancePercent: adv ? found(Number(adv[1]), adv[0]) : none(),
    balancePayment: bal
      ? found({ days: Number(bal[1]), basis: /^delivery$/i.test(bal[2]) ? ("after_delivery" as const) : /^invoice$/i.test(bal[2]) ? ("after_invoice" as const) : ("other" as const) }, bal[0])
      : none(),
    delivery: del
      ? found({ value: Number(del[1]), unit: unitOf(del[2]), from: "purchase_order" as const }, del[0])
      : none(),
    penalty: pen
      ? found({ percent: Number(pen[1]), period: pen[2].toLowerCase() as "week" | "day" | "month", basis: "order_value" as const }, pen[0])
      : none(),
    validity: val ? found({ days: Number(val[1]), untilDate: null }, val[0]) : none(),
  };
}
