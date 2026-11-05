import Papa from "papaparse";
import { PipelineError } from "@/lib/errors";
import { PrLineSchema, type PrLine } from "@/lib/types";

const COL = {
  pr: "PR number", item: "Item", desc: "Description", unit: "Unit",
  qty: "Quantity requested", max: "Maximum unit price (BDT)",
};

/** Node 1 helper: parse and validate purchase-request.csv. */
export function parsePurchaseRequest(csv: string): PrLine[] {
  if (!csv || !csv.trim()) throw new PipelineError("The purchase request CSV is empty.", "invalid_pr");
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ""), { header: true, skipEmptyLines: true });
  const cols = parsed.meta.fields ?? [];
  const missing = Object.values(COL).filter((c) => !cols.includes(c));
  if (missing.length) throw new PipelineError(`Purchase request CSV is missing column(s): ${missing.join(", ")}.`, "invalid_pr");
  const lines: PrLine[] = [];
  for (const [i, row] of parsed.data.entries()) {
    const res = PrLineSchema.safeParse({
      prNumber: row[COL.pr]?.trim(), itemId: row[COL.item]?.trim(), description: row[COL.desc]?.trim(),
      unit: row[COL.unit]?.trim(), quantity: Number(row[COL.qty]), maxUnitPrice: Number(row[COL.max]),
    });
    if (!res.success) throw new PipelineError(`Purchase request CSV row ${i + 2} is invalid.`, "invalid_pr");
    lines.push(res.data);
  }
  if (!lines.length) throw new PipelineError("The purchase request CSV has no item rows.", "invalid_pr");
  return lines;
}
