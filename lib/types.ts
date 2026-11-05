import { z } from "zod";

/* ---------- Extraction schema (what the LLM / parser must return) ---------- */

export const FieldStatus = z.enum(["extracted", "missing", "unclear"]);
export type FieldStatusT = z.infer<typeof FieldStatus>;

/** Every extracted field carries its status and the exact supporting text. */
const field = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    status: FieldStatus,
    value: value.nullable(),
    quote: z.string().nullable(),
    page: z.number().int().nullable(),
  });

const ItemSchema = z.object({
  itemId: field(z.string()),
  description: field(z.string()),
  unit: field(z.string()),
  quantity: field(z.number()),
  unitPrice: field(z.number()),
  lineTotal: field(z.number()),
});

export const ExtractionSchema = z.object({
  supplierName: field(z.string()),
  supplierTin: field(z.string()),
  supplierBin: field(z.string()),
  quotationNumber: field(z.string()),
  quotationDate: field(z.string()), // ISO yyyy-mm-dd
  prReference: field(z.string()),
  currency: field(z.string()),
  items: z.array(ItemSchema),
  subtotal: field(z.number()),
  vatPercent: field(z.number()),
  vatAmount: field(z.number()),
  grandTotal: field(z.number()),
  advancePercent: field(z.number()),
  balancePayment: field(
    z.object({
      days: z.number().nullable(),
      basis: z.enum(["after_delivery", "after_invoice", "other"]),
    }),
  ),
  delivery: field(
    z.object({
      value: z.number(),
      unit: z.enum(["days", "weeks", "months", "working_days", "other"]),
      from: z.enum(["purchase_order", "other"]),
    }),
  ),
  penalty: field(
    z.object({
      percent: z.number(),
      period: z.enum(["day", "week", "month", "other"]),
      basis: z.enum(["order_value", "other"]),
    }),
  ),
  validity: field(
    z.object({ days: z.number().nullable(), untilDate: z.string().nullable() }),
  ),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type Item = Extraction["items"][number];
export type Field<T> = {
  status: FieldStatusT;
  value: T | null;
  quote: string | null;
  page: number | null;
};

/* ---------- Pipeline data ---------- */

export interface PageText {
  page: number;
  text: string;
}

export const PrLineSchema = z.object({
  prNumber: z.string(),
  itemId: z.string(),
  description: z.string(),
  unit: z.string(),
  quantity: z.number().positive(),
  maxUnitPrice: z.number().positive(),
});
export type PrLine = z.infer<typeof PrLineSchema>;

export type Outcome = "pass" | "reject" | "review";
export type CheckGroup = "extraction" | "purchase_request" | "contract" | "financial";

export interface Check {
  id: string;
  group: CheckGroup;
  title: string;
  /** Reference to the company rule (e.g. "Reject #1") when one applies. */
  rule?: string;
  outcome: Outcome;
  message: string;
  expected?: string;
  actual?: string;
  quote?: string | null;
  page?: number | null;
  action?: string;
}

export type Decision = "APPROVE" | "REJECT" | "NEEDS_REVIEW";

export const DECISION_LABEL: Record<Decision, string> = {
  APPROVE: "Approve",
  REJECT: "Reject",
  NEEDS_REVIEW: "Needs a person to check",
};

export interface TraceEntry {
  node: string;
  ms: number;
  note?: string;
}

export type VerificationStepId = "ingest" | "extract" | "validate" | "compare" | "rules" | "financial" | "decide";

export interface VerificationProgress {
  step: VerificationStepId;
  status: "completed" | "failed";
  note?: string;
  findings?: string[];
  decision?: Decision;
}

export interface VerificationResult {
  docId: string;
  fileName: string;
  processedAt: string;
  extractorMode: "llm" | "heuristic" | "both";
  /** Set when the pipeline could not evaluate the document at all. */
  processingError: string | null;
  decision: Decision;
  supplierName: string | null;
  quotationNumber: string | null;
  prReference: string | null;
  itemId: string | null;
  extraction: Extraction | null;
  checks: Check[];
  triggered: Check[];
  financial: FinancialLine[];
  comparison: ComparisonRow[];
  summary: string;
  report: string;
  trace: TraceEntry[];
}

export interface FinancialLine {
  label: string;
  formula: string;
  expected: string | null;
  documented: string | null;
  ok: boolean | null;
}

export interface ComparisonRow {
  label: string;
  requested: string;
  quoted: string;
  difference: string;
  status: Outcome | "n/a";
}
