import { corsJson, corsOptions } from "@/lib/api-cors";
import { EXPECTED_SAMPLES, listSamples, readBundled } from "@/lib/server-data";
import { resolveMode } from "@/lib/extraction";

export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  const samples = await listSamples();
  return corsJson(req, {
    samples,
    missingSamples: EXPECTED_SAMPLES.filter((s) => !samples.includes(s)),
    hasPurchaseRequest: !!(await readBundled("purchase-request.csv")),
    hasRules: !!(await readBundled("company-rules.md")),
    rules: await readBundled("company-rules.md"),
    extractorMode: resolveMode(),
  });
}
