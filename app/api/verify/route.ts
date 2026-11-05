import { NextResponse } from "next/server";
import { runVerification } from "@/lib/langgraph/graph";
import { readBundled, readSample } from "@/lib/server-data";
import { MAX_PDF_BYTES } from "@/lib/pdf/read-pdf";

export const runtime = "nodejs";
export const maxDuration = 60; // one document per request keeps every call inside serverless limits

const MAX_CSV_BYTES = 200 * 1024;

/** POST multipart/form-data: `file` (PDF) or `sample` (bundled file name); optional `pr` (CSV). */
export async function POST(req: Request) {
  try {
    let form: FormData;
    try { form = await req.formData(); } catch { return NextResponse.json({ error: "Send multipart form data with a PDF file." }, { status: 400 }); }
    const file = form.get("file");
    const sample = form.get("sample");
    const pr = form.get("pr");

    let fileName: string;
    let bytes: Uint8Array;
    if (file instanceof File) {
      if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: "File is larger than 4 MB." }, { status: 413 });
      fileName = file.name;
      bytes = new Uint8Array(await file.arrayBuffer());
    } else if (typeof sample === "string") {
      const b = await readSample(sample);
      if (!b) return NextResponse.json({ error: "Unknown sample file." }, { status: 404 });
      fileName = sample;
      bytes = b;
    } else {
      return NextResponse.json({ error: "Provide a PDF file or a sample name." }, { status: 400 });
    }

    let prCsv: string | null;
    if (pr instanceof File) {
      if (pr.size > MAX_CSV_BYTES) return NextResponse.json({ error: "Purchase request CSV is too large." }, { status: 413 });
      prCsv = await pr.text();
    } else {
      prCsv = await readBundled("purchase-request.csv");
    }
    if (!prCsv) return NextResponse.json({ error: "No purchase request CSV is available." }, { status: 400 });

    // The pipeline converts every failure into a NEEDS_REVIEW result with a safe message.
    const result = await runVerification({ fileName, bytes, prCsv });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[veriq] /api/verify failed", e);
    return NextResponse.json({ error: "Verification failed unexpectedly." }, { status: 500 });
  }
}
