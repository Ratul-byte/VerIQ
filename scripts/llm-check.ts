/**
 * Diagnose the OpenRouter connection: `npm run llm:check`
 * 1) raw HTTP call (shows the exact status / body OpenRouter returns, key never printed)
 * 2) the real extraction path on data/samples/supplier-pack-01.pdf, with the field-by-field result
 */
import fs from "node:fs";
import { llmExtract } from "../lib/extraction/llm";
import { readPdf } from "../lib/pdf/read-pdf";

async function main() {
  try { process.loadEnvFile(".env.local"); } catch { /* env may already be set */ }
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free";
  console.log(`Model: ${model} | key: ${key ? `set (${key.length} chars)` : "MISSING"}`);
  if (!key) return;

  console.log("\n[1] Raw request…");
  const t0 = Date.now();
  try {
    const r = await fetch((process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1") + "/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: 'Reply with the JSON {"ok":true} and nothing else.' }], temperature: 0 }),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await r.text();
    console.log(`HTTP ${r.status} in ${Date.now() - t0} ms\n${text.slice(0, 900)}`);
  } catch (e) {
    console.log("Network failure:", (e as Error).message, (e as { cause?: unknown }).cause ?? "");
    return;
  }

  console.log("\n[2] Real extraction on supplier-pack-01.pdf…");
  const t1 = Date.now();
  try {
    const pages = await readPdf(new Uint8Array(fs.readFileSync("data/samples/supplier-pack-01.pdf")), "supplier-pack-01.pdf");
    const ex = await llmExtract(pages);
    console.log(`OK in ${Date.now() - t1} ms`);
    console.log("supplier:", ex.supplierName.value, "| qty:", ex.items[0]?.quantity.value, "| price:", ex.items[0]?.unitPrice.value, "| total:", ex.grandTotal.value);
  } catch (e) {
    console.log(`FAILED after ${Date.now() - t1} ms: ${(e as Error).message}`);
  }
}
main();
