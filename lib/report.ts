import { DECISION_LABEL, type Check, type VerificationResult } from "@/lib/types";

export function summarize(decision: VerificationResult["decision"], triggered: Check[], total: number, processingError: string | null): string {
  if (processingError) return `Could not be evaluated automatically: ${processingError}`;
  if (decision === "APPROVE") return `All ${total} checks passed.`;
  const key = decision === "REJECT" ? "reject" : "review";
  const msgs = triggered.filter((c) => c.outcome === key).map((c) => c.message);
  return msgs.join(" ");
}

/** Node 8 helper: human-readable report (Markdown). */
export function renderReport(r: Omit<VerificationResult, "report">): string {
  const L: string[] = [];
  L.push(`# Verification report: ${r.fileName}`);
  L.push("");
  L.push(`**Decision: ${DECISION_LABEL[r.decision]}**`);
  L.push(`Supplier: ${r.supplierName ?? "unknown"} | Quotation: ${r.quotationNumber ?? "unknown"} | Purchase request: ${r.prReference ?? "unknown"} | Item: ${r.itemId ?? "unknown"}`);
  L.push(`Extraction mode: ${r.extractorMode} | Processed: ${r.processedAt}`);
  L.push("");
  L.push(r.summary);
  if (r.processingError) return L.join("\n");
  L.push("");
  L.push("## Purchase request comparison");
  for (const c of r.comparison) L.push(`- ${c.label}: requested ${c.requested}, quoted ${c.quoted}, difference ${c.difference} [${c.status}]`);
  L.push("");
  L.push("## Checks");
  for (const c of r.checks) {
    L.push(`- [${c.outcome.toUpperCase()}] ${c.title}${c.rule ? ` (${c.rule})` : ""}: ${c.message}`);
    if (c.quote) L.push(`    - Source${c.page ? ` (page ${c.page})` : ""}: "${c.quote.replace(/\s+/g, " ")}"`);
    if (c.outcome !== "pass" && c.action) L.push(`    - Recommended action: ${c.action}`);
  }
  L.push("");
  L.push("## Financial verification");
  for (const f of r.financial) L.push(`- ${f.label} (${f.formula}): expected ${f.expected ?? "n/a"}, document ${f.documented ?? "n/a"} [${f.ok === null ? "unverifiable" : f.ok ? "ok" : "mismatch"}]`);
  return L.join("\n");
}
