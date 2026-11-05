/** CLI benchmark: `npm run eval`. Runs the pipeline on data/samples/*.pdf and compares with data/ground-truth.json. */
import fs from "node:fs";
import path from "node:path";
import { runVerification } from "../lib/langgraph/graph";
import { summarizeEval, CLASSES, type EvalRow } from "../lib/evaluation/metrics";
import type { Decision } from "../lib/types";

async function main() {
  const dir = path.join("data", "samples");
  const prCsv = fs.readFileSync("data/purchase-request.csv", "utf8");
  const gt = JSON.parse(fs.readFileSync("data/ground-truth.json", "utf8")) as { labels: { file: string; expected: Decision; verified: boolean }[] };
  const present = new Set(fs.readdirSync(dir).filter((f) => f.endsWith(".pdf")));
  const rows: EvalRow[] = [];
  for (const l of gt.labels.filter((x) => x.verified && present.has(x.file))) {
    const bytes = new Uint8Array(fs.readFileSync(path.join(dir, l.file)));
    const r = await runVerification({ fileName: l.file, bytes, prCsv });
    rows.push({ file: l.file, expected: l.expected, predicted: r.processingError ? null : r.decision, processingError: r.processingError });
    console.log(`${l.file}: expected ${l.expected}, predicted ${r.processingError ? "FAILED" : r.decision}`);
  }
  const s = summarizeEval(rows);
  console.log(`\nLabelled: ${s.labelled} (of 10 expected packs; ${present.size} present) | Correct: ${s.correct} | Failures: ${s.failures} | Accuracy: ${s.accuracy === null ? "n/a" : (s.accuracy * 100).toFixed(1) + "%"}`);
  console.log("Confusion (rows expected, cols predicted):", CLASSES.join(" / "));
  for (const e of CLASSES) console.log(e.padEnd(13), CLASSES.map((p) => s.confusion[e][p]).join("  "));
  fs.writeFileSync("eval-report.json", JSON.stringify({ rows, summary: s }, null, 2));
}
main();
