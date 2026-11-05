import fs from "node:fs/promises";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");
export const EXPECTED_SAMPLES = Array.from({ length: 10 }, (_, i) => `supplier-pack-${String(i + 1).padStart(2, "0")}.pdf`);

export async function listSamples(): Promise<string[]> {
  try {
    return (await fs.readdir(path.join(DATA, "samples"))).filter((f) => /^[\w.-]+\.pdf$/i.test(f)).sort();
  } catch { return []; }
}

export async function readSample(name: string): Promise<Uint8Array | null> {
  if (!/^[\w.-]+\.pdf$/i.test(name) || name.includes("..")) return null; // no path traversal
  const all = await listSamples();
  if (!all.includes(name)) return null;
  return new Uint8Array(await fs.readFile(path.join(DATA, "samples", name)));
}

export async function readBundled(file: "purchase-request.csv" | "company-rules.md" | "ground-truth.json"): Promise<string | null> {
  try { return await fs.readFile(path.join(DATA, file), "utf8"); } catch { return null; }
}
