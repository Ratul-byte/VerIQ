import { NextResponse } from "next/server";
import { readBundled } from "@/lib/server-data";

export const dynamic = "force-dynamic";

/** Labels are only served to the evaluation page; /api/verify never reads them. */
export async function GET() {
  const raw = await readBundled("ground-truth.json");
  if (!raw) return NextResponse.json({ labels: [] });
  try {
    const j = JSON.parse(raw);
    return NextResponse.json({ labels: j.labels ?? [] });
  } catch {
    return NextResponse.json({ labels: [], error: "ground-truth.json is invalid" }, { status: 500 });
  }
}
