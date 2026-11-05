import { extractText, getDocumentProxy } from "unpdf";
import { PipelineError } from "@/lib/errors";
import type { PageText } from "@/lib/types";

export const MAX_PDF_BYTES = 4 * 1024 * 1024; // stays under Vercel's 4.5 MB request limit
export const MAX_PAGES = 12;

/** Node 1 helper: validate and extract text per page. Never executes anything from the file. */
export async function readPdf(bytes: Uint8Array, fileName: string): Promise<PageText[]> {
  if (!/\.pdf$/i.test(fileName)) throw new PipelineError(`"${fileName}" is not a PDF file.`, "invalid_file");
  if (bytes.byteLength === 0) throw new PipelineError(`"${fileName}" is empty.`, "empty_document");
  if (bytes.byteLength > MAX_PDF_BYTES) throw new PipelineError(`"${fileName}" is larger than ${MAX_PDF_BYTES / 1024 / 1024} MB.`, "invalid_file");
  const head = new TextDecoder().decode(bytes.slice(0, 5));
  if (head !== "%PDF-") throw new PipelineError(`"${fileName}" does not look like a valid PDF.`, "invalid_file");

  let pages: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    if (pdf.numPages > MAX_PAGES) throw new PipelineError(`"${fileName}" has more than ${MAX_PAGES} pages.`, "invalid_file");
    const res = await extractText(pdf, { mergePages: false });
    pages = res.text as string[];
  } catch (e) {
    if (e instanceof PipelineError) throw e;
    throw new PipelineError(`"${fileName}" is corrupted or cannot be read as a PDF.`, "invalid_file");
  }
  const out = pages.map((text, i) => ({ page: i + 1, text }));
  if (out.map((p) => p.text).join("").replace(/\s+/g, "").length < 20) {
    throw new PipelineError(`"${fileName}" has no readable text (it may be a scanned image).`, "empty_document");
  }
  return out;
}
