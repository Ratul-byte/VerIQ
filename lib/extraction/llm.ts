import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { PipelineError } from "@/lib/errors";
import { ExtractionSchema, type Extraction, type PageText } from "@/lib/types";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const SYSTEM = `You extract structured data from ONE supplier quotation (with its terms and conditions).
Rules you must follow:
- Use ONLY the text provided. Never infer, estimate, or fill in typical values.
- For every field return status: "extracted" (clearly stated), "missing" (the document does not contain it) or "unclear" (present but ambiguous/contradictory).
- For "extracted" fields, "quote" MUST be copied verbatim from the document (a contiguous snippet, not paraphrased) and "page" the page number. For "missing", value, quote and page are null.
- Numbers: plain JSON numbers, no thousands separators, no currency symbols.
- quotationDate and validity.untilDate: ISO yyyy-mm-dd. If the date format is ambiguous (e.g. 03/04/2026), mark it "unclear".
- supplierTin / supplierBin: copy exactly as printed. If the label exists but the value is a placeholder (N/A, pending, blank), mark "missing".
- advancePercent: the percentage payable in advance. If the document explicitly says no advance, no advance payment, no advance payment required, without advance, or equivalent, return status "extracted" with value 0 and quote the exact wording. If no advance term is mentioned, mark "missing" (do not assume 0).
- balancePayment: days and the reference point ("after_delivery" only if the text says after delivery/acceptance of goods; "after_invoice" if after invoice; otherwise "other").
- delivery: value and unit exactly as stated; "from" = "purchase_order" only if counted from receiving/placing the purchase order.
- penalty: the late-delivery penalty. percent as stated, period (day/week/month), basis ("order_value" only if stated as % of order/contract value). If the document explicitly says there is no penalty, return status "missing" and quote that sentence. If there is no mention at all, return "missing".
- validity: days if stated as a period; untilDate if stated as an expiry date.
- items: one entry per quoted line. Do not merge lines. If the table is unreadable, return an empty array.
- itemId: copy the visible item code exactly. Never return JSON punctuation such as {, }, [, ], :, or quotes as an itemId; if the code is unclear, use status "unclear".
- Do not compute anything; copy figures as printed even if they look wrong.`;

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(t); } catch { /* fall through to brace slicing */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error("no json");
}

/** An HTTP-level failure reported by OpenRouter (or the provider behind it). `status` drives the fallback logic. */
class LlmHttpError extends PipelineError {
  constructor(message: string, public status: number) { super(message, "llm_unavailable"); }
}

const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Pulls the useful part out of an OpenRouter error body: { error: { message, code, metadata: { provider_name, raw } } }. */
function describeApiError(e: unknown): { status?: number; text: string } {
  const err = e as { status?: number; message?: string; error?: unknown };
  type ErrBody = { message?: string; code?: unknown; error?: ErrBody; metadata?: { provider_name?: string; raw?: unknown } };
  const body = (err.error && typeof err.error === "object" ? err.error : {}) as ErrBody;
  const inner: ErrBody = body.error && typeof body.error === "object" ? body.error : body; // some responses nest twice
  const parts: string[] = [];
  const msg = inner.message || err.message;
  if (msg) parts.push(String(msg));
  const prov = inner.metadata?.provider_name;
  const raw = inner.metadata?.raw;
  if (prov) parts.push(`(provider: ${prov})`);
  if (typeof raw === "string" && raw && !String(msg).includes(raw)) parts.push(raw);
  return { status: err.status ?? (typeof inner.code === "number" ? inner.code : undefined), text: clip(parts.join(" ").replace(/\s+/g, " ")) };
}

/** Extraction through OpenRouter (OpenAI-compatible). Works with any model; strict JSON schema is used when the model supports it. */
export async function llmExtract(pages: PageText[]): Promise<Extraction> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new PipelineError("LLM extraction is not configured (OPENROUTER_API_KEY missing).", "llm_unavailable");
  // Free reasoning models can take well over 40 s. Serverless hosts cap a request at ~60 s, so stay below that there.
  const timeout = Number(process.env.OPENROUTER_TIMEOUT_MS) || (process.env.VERCEL ? 50_000 : 120_000);
  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENROUTER_BASE_URL || OPENROUTER_BASE_URL,
    timeout,
    maxRetries: 1, // one retry for 429 / 5xx with backoff
    defaultHeaders: { "HTTP-Referer": process.env.APP_URL || "http://localhost:3000", "X-Title": "Ver-IQ" },
  });
  const model = process.env.OPENROUTER_MODEL;
  const body = pages.map((p) => `=== PAGE ${p.page} ===\n${p.text}`).join("\n\n");
  const rf = zodResponseFormat(ExtractionSchema, "quotation_extraction");
  const schemaText = JSON.stringify(rf.json_schema.schema);

  const ask = async (structured: boolean): Promise<Extraction> => {
    const res = (await client.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: structured ? SYSTEM : `${SYSTEM}\n\nReturn ONLY one JSON object (no prose, no markdown) that conforms to this JSON Schema:\n${schemaText}` },
        { role: "user", content: body },
      ],
      // Reasoning models (e.g. Nemotron) are slow and may spend the whole budget thinking; extraction needs little reasoning.
      ...(structured ? { response_format: rf, reasoning: { effort: "low" } } : {}),
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming)) as OpenAI.Chat.ChatCompletion & { error?: { message?: string; code?: number; metadata?: { provider_name?: string; raw?: unknown } } };

    // OpenRouter can answer HTTP 200 with an error body (provider failed mid-request) and no `choices`.
    if (res.error || !Array.isArray(res.choices) || res.choices.length === 0) {
      const d = describeApiError({ status: res.error?.code, error: res.error, message: "no completion returned" });
      throw new LlmHttpError(`OpenRouter returned an error for model ${model}: ${d.text}`, d.status ?? 502);
    }
    const choice = res.choices[0];
    const content = choice.message?.content;
    if (!content || !content.trim()) {
      throw new PipelineError(
        choice.finish_reason === "length"
          ? "The AI model ran out of output budget before answering (it spent it on reasoning)."
          : "The AI model returned an empty response.",
        "schema_failure",
      );
    }
    let json: unknown;
    try { json = parseJson(content); } catch {
      throw new PipelineError(choice.finish_reason === "length" ? "The AI model's answer was cut off before the JSON finished." : "The AI model did not return valid JSON.", "schema_failure");
    }
    const parsed = ExtractionSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new PipelineError(`The AI model's output did not match the required schema (${first?.path.join(".") || "root"}: ${first?.message}).`, "schema_failure");
    }
    return parsed.data;
  };

  const fail = (e: unknown): never => {
    if (e instanceof PipelineError) throw e;
    console.error("[veriq] OpenRouter call failed:", (e as Error)?.name, (e as Error)?.message, (e as { cause?: unknown })?.cause ?? "");
    // The SDK's error classes do not set `name`, so detect them with instanceof.
    if (e instanceof OpenAI.APIConnectionTimeoutError) {
      throw new PipelineError(`The AI model (${model}) did not answer within ${Math.round(timeout / 1000)} s. Free reasoning models can be slow: raise OPENROUTER_TIMEOUT_MS or pick a faster model.`, "timeout");
    }
    if (e instanceof OpenAI.APIConnectionError) {
      const code = ((e as { cause?: { code?: string; cause?: { code?: string } } }).cause?.code) || ((e as { cause?: { cause?: { code?: string } } }).cause?.cause?.code) || "network error";
      throw new PipelineError(`Could not reach OpenRouter (${code}). Check your internet connection / firewall and OPENROUTER_BASE_URL.`, "llm_unavailable");
    }
    const { status, text } = describeApiError(e);
    if (status === 429) throw new PipelineError(`The AI service is rate-limited right now (${model}). Free models allow only a few requests per minute and per day: wait a minute, or add credits / try another model. ${text}`.trim(), "llm_unavailable");
    if (status === 401 || status === 403) throw new PipelineError("The AI service rejected the API key.", "llm_unavailable");
    if (status === 402) throw new PipelineError("The AI service account has no credits for this model.", "llm_unavailable");
    if (status === 404 && /free model training|guardrail restrictions|data policy/i.test(text)) {
      throw new PipelineError(
        "OpenRouter blocked the required free model because this account disallows free-endpoint data use. Enable the free-endpoint privacy options in OpenRouter Settings > Privacy, then retry.",
        "llm_unavailable",
      );
    }
    if (status === 404) throw new PipelineError(`OpenRouter has no available endpoint for model "${model}" (it may have been removed or is down). ${text}`.trim(), "llm_unavailable");
    throw new PipelineError(`The AI extraction service failed${status ? ` (HTTP ${status})` : ""}: ${text || "unknown error"}`, "llm_unavailable");
  };

  try {
    return await ask(true);
  } catch (e) {
    const status = (e as { status?: number }).status;
    const unsupported = status === 400 || status === 404 || status === 422;
    const badOutput = e instanceof PipelineError && e.kind === "schema_failure";
    if (!unsupported && !badOutput) return fail(e);
    // Model/provider lacks strict structured output (or the reasoning option) or produced bad JSON: retry once with prompt-enforced JSON.
    // A policy block (guardrail / data policy) is not a capability problem, so do not retry it.
    const text = describeApiError(e).text;
    if (status === 404 && /free model training|guardrail restrictions|data policy/i.test(text)) return fail(e);
    try { return await ask(false); } catch (e2) { return fail(e2); }
  }
}
