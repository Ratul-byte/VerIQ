import { describe, expect, it } from "vitest";
import { summarizeEval, type EvalRow } from "@/lib/evaluation/metrics";

describe("evaluation metrics", () => {
  it("computes accuracy, confusion matrix, precision/recall", () => {
    const rows: EvalRow[] = [
      { file: "1", expected: "APPROVE", predicted: "APPROVE" },
      { file: "2", expected: "REJECT", predicted: "REJECT" },
      { file: "3", expected: "REJECT", predicted: "NEEDS_REVIEW" },
      { file: "4", expected: "NEEDS_REVIEW", predicted: "NEEDS_REVIEW" },
    ];
    const s = summarizeEval(rows);
    expect(s.accuracy).toBe(0.75);
    expect(s.confusion.REJECT.NEEDS_REVIEW).toBe(1);
    expect(s.perClass.REJECT.recall).toBe(0.5);
    expect(s.perClass.NEEDS_REVIEW.precision).toBe(0.5);
  });
  it("counts processing failures as not correct, and separately", () => {
    const s = summarizeEval([
      { file: "1", expected: "APPROVE", predicted: "APPROVE" },
      { file: "2", expected: "APPROVE", predicted: null },
    ]);
    expect(s.failures).toBe(1);
    expect(s.processed).toBe(1);
    expect(s.accuracy).toBe(0.5);
  });
  it("reports null accuracy when nothing is labelled", () => {
    expect(summarizeEval([]).accuracy).toBeNull();
  });
});
