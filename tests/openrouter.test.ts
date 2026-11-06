/**
 * Plumbing tests for the OpenRouter client against a LOCAL FAKE server.
 * They prove request/response handling, fallback and failure routing.
 * They say nothing about the quality of any real model.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runVerification } from "@/lib/langgraph/graph";
import { heuristicExtract } from "@/lib/extraction/heuristic";
import { readPdf } from "@/lib/pdf/read-pdf";

const pdf = new Uint8Array(fs.readFileSync("data/samples/supplier-pack-01.pdf"));
const prCsv = fs.readFileSync("data/purchase-request.csv", "utf8");

type Behaviour = "ok" | "no_schema_support" | "garbage" | "unauthorized" | "guardrail_blocked" | "wrong_price" | "fake_tin" | "error_in_200" | "provider_502" | "empty_reasoning" | "slow" | "fallback";
let behaviour: Behaviour = "ok";
let server: http.Server;
let lastRequest: { auth?: string; model?: string; hadSchema: boolean } | null = null;
let good: ReturnType<typeof heuristicExtract>;

const completion = (content: string) =>
  JSON.stringify({ id: "x", object: "chat.completion", created: 0, model: "fake", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }] });

beforeAll(async () => {
  good = heuristicExtract(await readPdf(pdf, "supplier-pack-01.pdf"));
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      lastRequest = { auth: req.headers.authorization, model: body.model, hadSchema: !!body.response_format };
      const send = (status: number, text: string) => { res.writeHead(status, { "content-type": "application/json" }); res.end(text); };
      if (behaviour === "fallback" && body.model === "vendor/some-model") return send(502, JSON.stringify({ error: { message: "primary unavailable", code: 502 } }));
      if (behaviour === "error_in_200") return send(200, JSON.stringify({ error: { message: "Provider returned error", code: 502, metadata: { provider_name: "FakeProvider", raw: "upstream overloaded" } } }));
      if (behaviour === "provider_502") return send(502, JSON.stringify({ error: { message: "Bad gateway from upstream", code: 502 } }));
      if (behaviour === "empty_reasoning") return send(200, JSON.stringify({ id: "x", object: "chat.completion", created: 0, model: "fake", choices: [{ index: 0, finish_reason: "length", message: { role: "assistant", content: null, reasoning: "thinking…" } }] }));
      if (behaviour === "slow") { setTimeout(() => send(200, completion(JSON.stringify(good))), 1500); return; }
      if (behaviour === "unauthorized") return send(401, JSON.stringify({ error: { message: "bad key" } }));
      if (behaviour === "guardrail_blocked") {
        return send(404, JSON.stringify({ error: { message: "0 endpoints out of 1 requested are available matching your guardrail restrictions and data policy. Free model training violation (account settings)." } }));
      }
      if (behaviour === "garbage") return send(200, completion("Sorry, I cannot help with that."));
      if (behaviour === "no_schema_support") {
        if (body.response_format) return send(400, JSON.stringify({ error: { message: "response_format unsupported" } }));
        return send(200, completion("```json\n" + JSON.stringify(good) + "\n```"));
      }
      const ex = structuredClone(good);
      if (behaviour === "wrong_price") ex.items[0].unitPrice.value = 450; // number not in its quote
      if (behaviour === "fake_tin") { ex.supplierTin.value = "999999999999"; ex.supplierTin.quote = "TIN: 999999999999"; }
      send(200, completion(JSON.stringify(ex)));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_MODEL = "vendor/some-model";
  process.env.OPENROUTER_FALLBACK_MODELS = "";
});
afterAll(() => { server.close(); delete process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_BASE_URL; delete process.env.OPENROUTER_MODEL; delete process.env.OPENROUTER_FALLBACK_MODELS; delete process.env.OPENROUTER_TIMEOUT_MS; });

const run = (mode: "llm" | "both") => runVerification({ fileName: "supplier-pack-01.pdf", bytes: pdf, prCsv, mode });

describe("OpenRouter client (fake server)", () => {
  it("sends the key and chosen model, and the pipeline approves a consistent extraction", async () => {
    behaviour = "ok";
    const r = await run("both");
    expect(lastRequest?.auth).toBe("Bearer test-key");
    expect(lastRequest?.model).toBe("vendor/some-model");
    expect(r.decision).toBe("APPROVE");
    expect(r.extractorMode).toBe("both");
  });
  it("falls back to prompt-enforced JSON when the model rejects response_format", async () => {
    behaviour = "no_schema_support";
    const r = await run("llm");
    expect(lastRequest?.hadSchema).toBe(false);
    expect(r.processingError).toBeNull();
    expect(r.decision).toBe("APPROVE");
  });
  it("tries configured fallback models when the primary model fails", async () => {
    behaviour = "fallback";
    process.env.OPENROUTER_FALLBACK_MODELS = "vendor/fallback-model";
    const r = await run("llm");
    expect(lastRequest?.model).toBe("vendor/fallback-model");
    expect(r.processingError).toBeNull();
    expect(r.decision).toBe("APPROVE");
    delete process.env.OPENROUTER_FALLBACK_MODELS;
  });
  it("non-JSON output -> NEEDS_REVIEW, never approval", async () => {
    behaviour = "garbage";
    const r = await run("llm");
    expect(r.decision).toBe("NEEDS_REVIEW");
    expect(r.processingError).toBeTruthy();
  });
  it("rejected API key -> NEEDS_REVIEW with a safe message", async () => {
    behaviour = "unauthorized";
    const r = await run("both");
    expect(r.decision).toBe("NEEDS_REVIEW");
    expect(r.processingError).toMatch(/API key/);
  });
  it("explains when account privacy settings block the required free model", async () => {
    behaviour = "guardrail_blocked";
    const r = await run("llm");
    expect(r.decision).toBe("NEEDS_REVIEW");
    expect(r.processingError).toMatch(/free-endpoint data use/i);
    expect(r.processingError).toMatch(/Settings > Privacy/);
  });
  it("a number the model invented (not in its quote) is caught by grounding", async () => {
    behaviour = "wrong_price";
    const r = await run("llm");
    expect(r.decision).toBe("NEEDS_REVIEW");
    expect(r.checks.find((c) => c.id === "unit_price")?.outcome).toBe("review");
  });
  it("a fabricated TIN quote is caught and cannot be approved", async () => {
    behaviour = "fake_tin";
    const r = await run("llm");
    expect(r.decision).toBe("NEEDS_REVIEW");
  });
  it("surfaces an error that OpenRouter wraps in an HTTP 200 body (no 'choices') instead of crashing", async () => {
    behaviour = "error_in_200";
    const r = await run("llm");
    expect(r.decision).toBe("NEEDS_REVIEW");
    expect(r.processingError).toMatch(/FakeProvider/);
    expect(r.processingError).toMatch(/upstream overloaded|Provider returned error/);
  });
  it("shows the real HTTP status and message instead of a generic failure", async () => {
    behaviour = "provider_502";
    const r = await run("llm");
    expect(r.processingError).toMatch(/HTTP 502/);
    expect(r.processingError).toMatch(/Bad gateway from upstream/);
  });
  it("explains an empty answer from a reasoning model that ran out of output budget", async () => {
    behaviour = "empty_reasoning";
    const r = await run("llm");
    expect(r.decision).toBe("NEEDS_REVIEW");
    expect(r.processingError).toMatch(/output budget|reasoning/i);
  });
  it("reports a timeout as a timeout (not as a generic failure)", async () => {
    behaviour = "slow";
    process.env.OPENROUTER_TIMEOUT_MS = "300";
    const r = await run("llm");
    delete process.env.OPENROUTER_TIMEOUT_MS;
    expect(r.decision).toBe("NEEDS_REVIEW");
    expect(r.processingError).toMatch(/did not answer within/);
    expect(r.processingError).toMatch(/OPENROUTER_TIMEOUT_MS/);
  }, 15000);
});
