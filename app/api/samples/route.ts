import { NextResponse } from "next/server";
import { EXPECTED_SAMPLES, listSamples, readBundled } from "@/lib/server-data";
import { resolveMode } from "@/lib/extraction";

export const dynamic = "force-dynamic";

export async function GET() {
  const samples = await listSamples();
  return NextResponse.json({
    samples,
    missingSamples: EXPECTED_SAMPLES.filter((s) => !samples.includes(s)),
    hasPurchaseRequest: !!(await readBundled("purchase-request.csv")),
    hasRules: !!(await readBundled("company-rules.md")),
    rules: await readBundled("company-rules.md"),
    extractorMode: resolveMode(),
  });
}
