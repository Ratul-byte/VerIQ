import type { Check, Decision } from "@/lib/types";

/**
 * Every id below must have been evaluated for a document to be APPROVED.
 * If a check never ran (e.g. the item could not be matched), approval is impossible.
 */
export const REQUIRED_CHECKS = [
  "pr_reference", "item_match", "item_description", "item_unit", "quantity", "unit_price",
  "tin", "bin", "advance", "penalty", "delivery", "payment", "validity", "vat",
  "subtotal", "vat_amount", "grand_total",
] as const;

/** Node 7: deterministic final decision. REJECT > NEEDS_REVIEW > APPROVE. */
export function decide(checks: Check[], processingError: string | null): { decision: Decision; triggered: Check[] } {
  const triggered = checks.filter((c) => c.outcome !== "pass");
  if (processingError) return { decision: "NEEDS_REVIEW", triggered };
  if (checks.some((c) => c.outcome === "reject")) return { decision: "REJECT", triggered };
  if (checks.some((c) => c.outcome === "review")) return { decision: "NEEDS_REVIEW", triggered };
  const ran = new Set(checks.map((c) => c.id));
  const incomplete = REQUIRED_CHECKS.filter((id) => !ran.has(id));
  const hasLineTotal = [...ran].some((id) => id.startsWith("line_total_"));
  if (incomplete.length > 0 || !hasLineTotal) {
    return {
      decision: "NEEDS_REVIEW",
      triggered: [
        ...triggered,
        {
          id: "incomplete", group: "extraction", title: "Verification incomplete", outcome: "review",
          message: `Not every required check could run (${incomplete.join(", ") || "line totals"}).`,
          action: "Review the document manually.",
        },
      ],
    };
  }
  return { decision: "APPROVE", triggered: [] };
}
