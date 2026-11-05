import fs from "node:fs";
import path from "node:path";
import { runVerification } from "../lib/langgraph/graph";

async function main() {
  const bytes = new Uint8Array(fs.readFileSync(path.join("data/samples/supplier-pack-01.pdf")));
  const prCsv = fs.readFileSync("data/purchase-request.csv", "utf8");
  const r = await runVerification({ fileName: "supplier-pack-01.pdf", bytes, prCsv, mode: "heuristic" });
  console.log(r.decision, "|", r.summary);
  console.log(r.checks.map((c) => `${c.outcome.padEnd(6)} ${c.id}: ${c.message}`).join("\n"));
  console.log(r.trace.map((t) => `${t.node} ${t.ms}ms ${t.note ?? ""}`).join("\n"));
  if (r.processingError) console.log("ERR", r.processingError);
}
main();
