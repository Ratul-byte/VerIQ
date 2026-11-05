import type { Decision } from "@/lib/types";

export const CLASSES: Decision[] = ["APPROVE", "REJECT", "NEEDS_REVIEW"];

export interface EvalRow {
  file: string;
  expected: Decision;
  predicted: Decision | null; // null = processing failure (no result)
  processingError?: string | null;
}

export interface ClassMetrics { precision: number | null; recall: number | null; f1: number | null; support: number }

export interface EvalSummary {
  labelled: number;
  processed: number;
  failures: number;
  correct: number;
  incorrect: number;
  accuracy: number | null;
  confusion: Record<Decision, Record<Decision, number>>; // confusion[expected][predicted]
  perClass: Record<Decision, ClassMetrics>;
}

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

/** Only rows with a verified ground-truth label are passed in. Processing failures are counted separately. */
export function summarizeEval(rows: EvalRow[]): EvalSummary {
  const confusion = Object.fromEntries(
    CLASSES.map((e) => [e, Object.fromEntries(CLASSES.map((p) => [p, 0]))]),
  ) as EvalSummary["confusion"];
  let correct = 0, processed = 0, failures = 0;
  for (const r of rows) {
    if (r.predicted === null) { failures++; continue; }
    processed++;
    confusion[r.expected][r.predicted]++;
    if (r.expected === r.predicted) correct++;
  }
  const perClass = Object.fromEntries(
    CLASSES.map((c) => {
      const tp = confusion[c][c];
      const fp = CLASSES.reduce((a, e) => a + (e === c ? 0 : confusion[e][c]), 0);
      const fn = CLASSES.reduce((a, p) => a + (p === c ? 0 : confusion[c][p]), 0);
      const precision = ratio(tp, tp + fp);
      const recall = ratio(tp, tp + fn);
      const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : precision === null && recall === null ? null : 0;
      return [c, { precision, recall, f1, support: tp + fn }];
    }),
  ) as EvalSummary["perClass"];
  return {
    labelled: rows.length, processed, failures, correct,
    incorrect: processed - correct,
    // A failed document counts as not correct: accuracy is over all labelled documents.
    accuracy: rows.length ? correct / rows.length : null,
    confusion, perClass,
  };
}
