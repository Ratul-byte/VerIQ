import type { Extraction, VerificationResult } from "@/lib/types";
import { SUPPLIER_PACKS, type SupplierPackReference } from "./reference";
import type { EvalRow } from "./metrics";

export interface EvaluationRow extends EvalRow {
  reason: string;
  why?: string;
  evidence: string[];
}

const same = (a: number | string | null | undefined, b: number | string | null | undefined) =>
  a === b;

function fieldValue<T>(field: { status: string; value: T | null } | undefined): T | null {
  return field?.status === "extracted" ? field.value : null;
}

function evidenceMismatches(extraction: Extraction | null, reference: SupplierPackReference): string[] {
  if (!extraction) return ["No extraction was saved."];
  const item = extraction.items[0];
  const mismatches: string[] = [];
  if (!item || fieldValue(item.itemId) !== reference.itemId) mismatches.push("item");
  if (reference.quantity !== undefined && !same(fieldValue(item?.quantity), reference.quantity)) mismatches.push("quantity");
  if (reference.unitPrice !== undefined && !same(fieldValue(item?.unitPrice), reference.unitPrice)) mismatches.push("unit price");
  if (reference.advancePercent !== undefined && !same(fieldValue(extraction.advancePercent), reference.advancePercent)) mismatches.push("advance");
  if (reference.paymentDays !== undefined) {
    const payment = fieldValue(extraction.balancePayment);
    if (!payment || payment.days !== reference.paymentDays || payment.basis !== reference.paymentBasis) mismatches.push("payment terms");
  }
  if (reference.deliveryDays !== undefined) {
    const delivery = fieldValue(extraction.delivery);
    if (!delivery || delivery.value !== reference.deliveryDays || delivery.unit !== "days") mismatches.push("delivery");
  }
  if (reference.penaltyPercentPerWeek !== undefined) {
    const penalty = fieldValue(extraction.penalty);
    if (reference.penaltyPercentPerWeek === 0 ? penalty !== null : !penalty || penalty.percent !== reference.penaltyPercentPerWeek || penalty.period !== "week") {
      mismatches.push("penalty");
    }
  }
  if (reference.tinPresent !== undefined && (fieldValue(extraction.supplierTin) !== null) !== reference.tinPresent) mismatches.push("TIN");
  if (reference.binPresent !== undefined && (fieldValue(extraction.supplierBin) !== null) !== reference.binPresent) mismatches.push("BIN");
  return mismatches;
}

function findReference(result: VerificationResult): SupplierPackReference | undefined {
  return SUPPLIER_PACKS.find((pack) =>
    pack.file === result.fileName || pack.quotationNumber === result.quotationNumber,
  );
}

export function evaluateResults(results: VerificationResult[]): EvaluationRow[] {
  const rows: EvaluationRow[] = [];
  for (const result of results) {
    const reference = findReference(result);
    if (!reference) continue;
    const processingError = result.processingError;
    rows.push({
      file: reference.file,
      expected: reference.expected,
      predicted: processingError ? null : result.decision,
      processingError,
      reason: reference.reason,
      why: processingError ?? result.summary,
      evidence: evidenceMismatches(result.extraction, reference),
    });
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}
