import { corsJson, corsOptions } from "@/lib/api-cors";
import { readBundled } from "@/lib/server-data";

export const dynamic = "force-dynamic";

/** Labels are only served to the evaluation page; /api/verify never reads them. */
export function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  const raw = await readBundled("ground-truth.json");
  if (!raw) return corsJson(req, { labels: [] });
  try {
    const j = JSON.parse(raw);
    return corsJson(req, { labels: j.labels ?? [] });
  } catch {
    return corsJson(req, { labels: [], error: "ground-truth.json is invalid" }, { status: 500 });
  }
}
