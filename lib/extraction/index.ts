import { D } from "@/lib/money";
import { PipelineError } from "@/lib/errors";
import type { Extraction, Field, PageText } from "@/lib/types";
import { heuristicExtract } from "./heuristic";
import { llmExtract } from "./llm";

export type ExtractorMode = "llm" | "heuristic" | "both";

export function resolveMode(): ExtractorMode {
  const env = (process.env.EXTRACTOR_MODE || "").toLowerCase();
  const hasKey = !!process.env.OPENROUTER_API_KEY;
  if (env === "llm" || env === "heuristic" || env === "both") return env;
  return hasKey ? "both" : "heuristic";
}

const strip = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const validItemId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value);

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return D(a).eq(b);
  if (typeof a === "string" && typeof b === "string") {
    const x = strip(a), y = strip(b);
    return x === y || x.includes(y) || y.includes(x);
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object);
    return ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a === b;
}

/** Where the LLM and the parser both extracted a value and disagree, the field becomes "unclear". */
function crossCheck(llm: Extraction, heur: Extraction): { merged: Extraction; conflicts: string[] } {
  const merged = structuredClone(llm);
  const conflicts: string[] = [];
  const cmp = (name: string, a: Field<unknown>, b: Field<unknown>) => {
    if (a.status === "extracted" && b.status === "extracted" && !sameValue(a.value, b.value)) {
      a.status = "unclear";
      conflicts.push(name);
    }
  };
  for (const k of Object.keys(merged) as (keyof Extraction)[]) {
    if (k === "items") continue;
    cmp(k, merged[k] as Field<unknown>, heur[k] as Field<unknown>);
  }
  if (heur.items.length > 0) {
    if (heur.items.length !== merged.items.length) conflicts.push("items");
    merged.items.forEach((it, i) => {
      const h = heur.items[i];
      if (!h) return;
      for (const k of ["itemId", "description", "unit", "quantity", "unitPrice", "lineTotal"] as const) {
        if (k === "itemId" && h[k].status === "extracted" && (it[k].status !== "extracted" || !validItemId(it[k].value))) {
          it[k] = structuredClone(h[k]);
          continue;
        }
        cmp(`items[${i}].${k}`, it[k] as Field<unknown>, h[k] as Field<unknown>);
      }
    });
  }
  return { merged, conflicts };
}

/** Node 2. If the LLM is required and fails, this throws: a processing error can never become an approval. */
export async function extractQuotation(pages: PageText[], mode = resolveMode()): Promise<{ extraction: Extraction; mode: ExtractorMode; conflicts: string[] }> {
  if (mode === "heuristic") return { extraction: heuristicExtract(pages), mode, conflicts: [] };
  const llm = await llmExtract(pages);
  if (mode === "llm") return { extraction: llm, mode, conflicts: [] };
  const { merged, conflicts } = crossCheck(llm, heuristicExtract(pages));
  return { extraction: merged, mode, conflicts };
}

export { PipelineError };
