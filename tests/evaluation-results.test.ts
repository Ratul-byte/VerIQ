import { describe, expect, it } from "vitest";
import { evaluateResults } from "@/lib/evaluation/evaluate";
import type { VerificationResult } from "@/lib/types";
import { cleanExtraction } from "./helpers";

function result(overrides: Partial<VerificationResult> = {}): VerificationResult {
  return {
    docId: "doc-1",
    fileName: "supplier-pack-01.pdf",
    processedAt: "2026-11-06T00:00:00.000Z",
    extractorMode: "heuristic",
    processingError: null,
    decision: "APPROVE",
    supplierName: "Padma Textile Mills Ltd",
    quotationNumber: "QT-2026-901",
    prReference: "PR-2026-114",
    itemId: "A",
    extraction: cleanExtraction(),
    checks: [],
    triggered: [],
    financial: [],
    comparison: [],
    summary: "All checks passed.",
    report: "",
    trace: [],
    ...overrides,
  };
}

describe("saved-result evaluation", () => {
  it("evaluates persisted results without running verification", () => {
    const [row] = evaluateResults([result()]);
    expect(row.expected).toBe("APPROVE");
    expect(row.predicted).toBe("APPROVE");
    expect(row.evidence).toEqual([]);
  });

  it("matches a saved result by quotation number", () => {
    const [row] = evaluateResults([result({ fileName: "uploaded.pdf" })]);
    expect(row.file).toBe("supplier-pack-01.pdf");
  });

  it("reports processing failures as failed evaluations", () => {
    const [row] = evaluateResults([result({ processingError: "PDF could not be read" })]);
    expect(row.predicted).toBeNull();
    expect(row.processingError).toBe("PDF could not be read");
  });

  it("ignores results that cannot be mapped to the supplier reference", () => {
    expect(evaluateResults([result({ fileName: "other.pdf", quotationNumber: "QT-unknown" })])).toEqual([]);
  });
});
