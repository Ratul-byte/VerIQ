import type { VerificationResult } from "@/lib/types";
import { DECISION_LABEL } from "@/lib/types";
import type { HumanReview } from "@/lib/client-store";

const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

export function resultsToCsv(rows: VerificationResult[], reviews: Record<string, HumanReview>): string {
  const head = ["File", "Supplier", "Quotation", "PR reference", "Item", "System decision", "Human decision", "Human note", "Issues", "Processing error"];
  const lines = rows.map((r) => {
    const h = reviews[r.docId];
    return [
      r.fileName, r.supplierName, r.quotationNumber, r.prReference, r.itemId, DECISION_LABEL[r.decision],
      h ? DECISION_LABEL[h.decision] : "", h?.note ?? "", r.triggered.map((t) => `${t.title}: ${t.message}`).join(" | "), r.processingError ?? "",
    ].map(esc).join(",");
  });
  return [head.map(esc).join(","), ...lines].join("\r\n");
}

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
