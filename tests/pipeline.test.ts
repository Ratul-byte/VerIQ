import fs from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";
import { runVerification } from "@/lib/langgraph/graph";
import { heuristicExtract } from "@/lib/extraction/heuristic";
import { validateExtraction } from "@/lib/extraction/validate";
import { readPdf } from "@/lib/pdf/read-pdf";
import { parsePurchaseRequest } from "@/lib/pr/parse";
import { cleanExtraction, missing, ok } from "./helpers";

const pdf = new Uint8Array(fs.readFileSync("data/samples/supplier-pack-01.pdf"));
const prCsv = fs.readFileSync("data/purchase-request.csv", "utf8");

beforeAll(() => { delete process.env.OPENROUTER_API_KEY; });

describe("extraction on the real sample", () => {
  it("extracts supplier information and terms from supplier-pack-01", async () => {
    const pages = await readPdf(pdf, "supplier-pack-01.pdf");
    const ex = heuristicExtract(pages);
    expect(ex.supplierName.value).toBe("Padma Textile Mills Ltd");
    expect(ex.quotationNumber.value).toBe("QT-2026-901");
    expect(ex.supplierTin.value).toBe("101458013391");
    expect(ex.supplierBin.value).toBe("000170141-0101");
    expect(ex.prReference.value).toBe("PR-2026-114");
    expect(ex.items[0].quantity.value).toBe(12000);
    expect(ex.items[0].unitPrice.value).toBe(472);
    expect(ex.grandTotal.value).toBe(6513600);
    expect(ex.advancePercent.value).toBe(10);
    expect(ex.delivery.value).toEqual({ value: 24, unit: "days", from: "purchase_order" });
  });

  it("runs the whole graph and approves pack-01 with evidence", async () => {
    const r = await runVerification({ fileName: "supplier-pack-01.pdf", bytes: pdf, prCsv, mode: "heuristic" });
    expect(r.decision).toBe("APPROVE");
    expect(r.processingError).toBeNull();
    expect(r.checks.every((c) => c.outcome === "pass")).toBe(true);
    expect(r.checks.find((c) => c.id === "unit_price")?.quote).toContain("472.00");
    expect(r.trace.length).toBeGreaterThanOrEqual(7);
  });
});

describe("failure handling never becomes an approval", () => {
  it("LLM required but unavailable -> NEEDS_REVIEW with a processing error", async () => {
    const r = await runVerification({ fileName: "supplier-pack-01.pdf", bytes: pdf, prCsv, mode: "llm" });
    expect(r.decision).toBe("NEEDS_REVIEW");
    expect(r.processingError).toBeTruthy();
    expect(r.processingError).not.toMatch(/stack|at .*\(/);
  });
  it("garbage bytes named .pdf -> processing error", async () => {
    const r = await runVerification({ fileName: "bad.pdf", bytes: new TextEncoder().encode("not a pdf at all"), prCsv, mode: "heuristic" });
    expect(r.decision).toBe("NEEDS_REVIEW");
    expect(r.processingError).toMatch(/valid PDF/);
  });
  it("empty file -> processing error", async () => {
    const r = await runVerification({ fileName: "empty.pdf", bytes: new Uint8Array(), prCsv, mode: "heuristic" });
    expect(r.processingError).toMatch(/empty/);
  });
  it("truncated/corrupted PDF -> processing error", async () => {
    const r = await runVerification({ fileName: "broken.pdf", bytes: pdf.slice(0, 400), prCsv, mode: "heuristic" });
    expect(r.decision).toBe("NEEDS_REVIEW");
    expect(r.processingError).toBeTruthy();
  });
  it("wrong file type -> processing error", async () => {
    const r = await runVerification({ fileName: "notes.txt", bytes: pdf, prCsv, mode: "heuristic" });
    expect(r.processingError).toMatch(/not a PDF/);
  });
  it("invalid purchase request CSV -> processing error", async () => {
    const r = await runVerification({ fileName: "supplier-pack-01.pdf", bytes: pdf, prCsv: "a,b\n1,2", mode: "heuristic" });
    expect(r.decision).toBe("NEEDS_REVIEW");
    expect(r.processingError).toMatch(/missing column/);
  });
  it("empty purchase request CSV -> processing error", () => {
    expect(() => parsePurchaseRequest("")).toThrow();
  });
});

describe("extraction validation (grounding)", () => {
  const pages = [{ page: 1, text: "Quotation QT-1\nSupplier TIN: 123456789012 BIN: 000170141-0101\nUnit price 472.00" }];

  it("downgrades a value whose quotation is not in the document", () => {
    const ex = cleanExtraction();
    ex.supplierTin = ok("123456789012", "TIN: 999999999999");
    const { extraction, issues } = validateExtraction(ex, pages);
    expect(extraction.supplierTin.status).toBe("unclear");
    expect(issues.some((i) => i.id === "extraction_supplierTin")).toBe(true);
  });
  it("downgrades a number that is not in its quotation", () => {
    const ex = cleanExtraction();
    ex.items[0].unitPrice = ok(450, "Unit price 472.00");
    const { extraction } = validateExtraction(ex, pages);
    expect(extraction.items[0].unitPrice.status).toBe("unclear");
  });
  it("keeps a correctly grounded value", () => {
    const ex = cleanExtraction();
    ex.supplierTin = ok("123456789012", "Supplier TIN: 123456789012");
    expect(validateExtraction(ex, pages).extraction.supplierTin.status).toBe("extracted");
  });
  it("does not let a 'missing' TIN stand when the text contains one", () => {
    const ex = cleanExtraction(); ex.supplierTin = missing();
    expect(validateExtraction(ex, pages).extraction.supplierTin.status).toBe("unclear");
  });
  it("treats a TIN placeholder with no digits as missing", () => {
    const ex = cleanExtraction();
    ex.supplierTin = ok("pending", "TIN: pending");
    const p = [{ page: 1, text: "Supplier TIN: pending" }];
    expect(validateExtraction(ex, p).extraction.supplierTin.status).toBe("missing");
  });
  it("rejects a structurally invalid extraction", () => {
    expect(() => validateExtraction({ bogus: true } as never, pages)).toThrow();
  });
});
