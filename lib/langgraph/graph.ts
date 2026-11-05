import { createHash } from "node:crypto";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { PipelineError } from "@/lib/errors";
import { extractQuotation, resolveMode, type ExtractorMode } from "@/lib/extraction";
import { validateExtraction } from "@/lib/extraction/validate";
import { readPdf } from "@/lib/pdf/read-pdf";
import { parsePurchaseRequest } from "@/lib/pr/parse";
import { renderReport, summarize } from "@/lib/report";
import { comparePurchaseRequest } from "@/lib/rules/comparison";
import { checkContractRules } from "@/lib/rules/contract";
import { decide } from "@/lib/rules/decision";
import { verifyFinancials } from "@/lib/rules/financial";
import { usable } from "@/lib/rules/util";
import type {
  Check, ComparisonRow, Decision, Extraction, FinancialLine, PageText, PrLine, TraceEntry, VerificationResult,
  VerificationProgress, VerificationStepId,
} from "@/lib/types";

const concat = <T,>() => ({ reducer: (a: T[], b: T[]) => a.concat(b), default: () => [] as T[] });

/** Typed pipeline state. Every node reads/writes explicit fields; nothing is hidden in prompts. */
const State = Annotation.Root({
  fileName: Annotation<string>(),
  pdfBytes: Annotation<Uint8Array>(),
  prCsv: Annotation<string>(),
  docId: Annotation<string>(),
  pages: Annotation<PageText[]>(),
  prLines: Annotation<PrLine[]>(),
  extractorMode: Annotation<ExtractorMode>(),
  extraction: Annotation<Extraction | null>(),
  issues: Annotation<Check[]>(concat<Check>()),
  checks: Annotation<Check[]>(concat<Check>()),
  comparison: Annotation<ComparisonRow[]>(),
  financial: Annotation<FinancialLine[]>(),
  decision: Annotation<Decision | null>(),
  triggered: Annotation<Check[]>(),
  processingError: Annotation<string | null>(),
  trace: Annotation<TraceEntry[]>(concat<TraceEntry>()),
  result: Annotation<VerificationResult | null>(),
});
type S = typeof State.State;
type U = typeof State.Update;

/** Wraps a node: timing, trace, and conversion of any failure into a safe processing error. */
function node(name: string, fn: (s: S) => Promise<U & { _note?: string }> | (U & { _note?: string })) {
  return async (s: S): Promise<U> => {
    const t0 = Date.now();
    try {
      const { _note, ...out } = await fn(s);
      return { ...out, trace: [{ node: name, ms: Date.now() - t0, note: _note }] };
    } catch (e) {
      const msg = e instanceof PipelineError ? e.message : "An unexpected processing error occurred.";
      if (!(e instanceof PipelineError)) console.error(`[veriq] node ${name} failed`, e);
      return { processingError: msg, trace: [{ node: name, ms: Date.now() - t0, note: `error: ${msg}` }] };
    }
  };
}

/* Node 1 */
const ingest = node("1 · Document ingestion", async (s) => {
  const prLines = parsePurchaseRequest(s.prCsv);
  const pages = await readPdf(s.pdfBytes, s.fileName);
  const docId = createHash("sha256").update(s.pdfBytes).digest("hex").slice(0, 12);
  return { prLines, pages, docId, _note: `${pages.length} page(s), ${prLines.length} PR line(s)` };
});

/* Node 2 */
const extract = node("2 · Structured extraction", async (s) => {
  const { extraction, mode, conflicts } = await extractQuotation(s.pages, s.extractorMode);
  const issues: Check[] = conflicts.map((name) => ({
    id: `conflict_${name}`, group: "extraction" as const, title: `Extraction conflict: ${name}`, outcome: "review" as const,
    message: "The AI extraction and the rule-based parser disagree on this field.", action: "Check this field against the original document.",
  }));
  return { extraction, extractorMode: mode, issues, _note: `mode=${mode}${conflicts.length ? `, ${conflicts.length} conflict(s)` : ""}` };
});

/* Node 3 */
const validate = node("3 · Extraction validation", (s) => {
  try {
    const { extraction, issues } = validateExtraction(s.extraction!, s.pages);
    return { extraction, issues, _note: `${issues.filter((i) => i.outcome === "review").length} issue(s)` };
  } catch {
    throw new PipelineError("The extracted data did not match the required schema.", "schema_failure");
  }
});

/* Node 4 */
const compare = node("4 · Purchase request comparison", (s) => {
  const { checks, rows } = comparePurchaseRequest(s.extraction!, s.prLines);
  return { checks, comparison: rows };
});

/* Node 5 */
const rules = node("5 · Contract rule verification", (s) => ({ checks: checkContractRules(s.extraction!) }));

/* Node 6 */
const financial = node("6 · Financial verification", (s) => {
  const { checks, lines } = verifyFinancials(s.extraction!);
  return { checks, financial: lines };
});

/* Node 7: deterministic. The LLM never sees or sets this. */
const decideNode = node("7 · Final decision", (s) => {
  const all = [...s.issues, ...s.checks];
  const { decision, triggered } = decide(all, s.processingError ?? null);
  return { decision, triggered, _note: decision };
});

/* Review branch: only reached when a person must look at the document. */
const escalate = node("7b · Escalate to human review", (s) => ({
  _note: `${s.triggered?.length ?? 0} issue(s) queued for a reviewer`,
}));

/* Node 8 */
const report = node("8 · Report generation", (s) => {
  const ex = s.extraction;
  const checks = [...(s.issues ?? []), ...(s.checks ?? [])];
  const decision: Decision = s.processingError ? "NEEDS_REVIEW" : s.decision ?? "NEEDS_REVIEW";
  const triggered = s.processingError ? [] : s.triggered ?? checks.filter((c) => c.outcome !== "pass");
  const base = {
    docId: s.docId ?? createHash("sha256").update(s.fileName ?? "unknown").digest("hex").slice(0, 12),
    fileName: s.fileName,
    processedAt: new Date().toISOString(),
    extractorMode: s.extractorMode ?? resolveMode(),
    processingError: s.processingError ?? null,
    decision,
    supplierName: ex ? usable(ex.supplierName) ?? null : null,
    quotationNumber: ex ? usable(ex.quotationNumber) ?? null : null,
    prReference: ex ? usable(ex.prReference) ?? null : null,
    itemId: ex && ex.items[0] ? usable(ex.items[0].itemId) ?? null : null,
    extraction: ex ?? null,
    checks,
    triggered,
    financial: s.financial ?? [],
    comparison: s.comparison ?? [],
    summary: summarize(decision, triggered, checks.length, s.processingError ?? null),
    trace: s.trace ?? [],
  };
  return { result: { ...base, report: renderReport(base) } };
});

const after = (next: string) => (s: S) => (s.processingError ? "report" : next);

const graph = new StateGraph(State)
  .addNode("ingest", ingest)
  .addNode("extract", extract)
  .addNode("validate", validate)
  .addNode("compare", compare)
  .addNode("rules", rules)
  .addNode("verify_financials", financial)
  .addNode("decide", decideNode)
  .addNode("escalate", escalate)
  .addNode("report", report)
  .addEdge(START, "ingest")
  .addConditionalEdges("ingest", after("extract"), ["extract", "report"])
  .addConditionalEdges("extract", after("validate"), ["validate", "report"])
  .addConditionalEdges("validate", after("compare"), ["compare", "report"])
  .addEdge("compare", "rules")
  .addEdge("rules", "verify_financials")
  .addEdge("verify_financials", "decide")
  .addConditionalEdges("decide", (s) => (s.decision === "NEEDS_REVIEW" ? "escalate" : "report"), ["escalate", "report"])
  .addEdge("escalate", "report")
  .addEdge("report", END)
  .compile();

const progressSteps: Record<string, VerificationStepId> = {
  ingest: "ingest",
  extract: "extract",
  validate: "validate",
  compare: "compare",
  rules: "rules",
  verify_financials: "financial",
  decide: "decide",
};

function progressFor(nodeName: string, update: Partial<S>): VerificationProgress | null {
  const step = progressSteps[nodeName];
  if (!step) return null;
  const trace = update.trace?.[0];
  const findings: string[] = [];
  if (step === "ingest") {
    if (update.pages?.length) findings.push(`${update.pages.length} page(s) read`);
    if (update.prLines?.length) findings.push(`${update.prLines.length} purchase-request line(s) loaded`);
  } else if (step === "extract" && update.extraction) {
    const extracted = Object.values(update.extraction).filter((value) => value && typeof value === "object" && "status" in value && value.status === "extracted").length;
    findings.push(`${extracted} field(s) extracted`);
    if (update.issues?.length) findings.push(`${update.issues.length} extraction conflict(s)`);
  } else if (step === "validate" && update.issues) {
    const reviews = update.issues.filter((issue) => issue.outcome === "review").length;
    findings.push(reviews ? `${reviews} validation issue(s) need review` : "All extracted evidence is grounded");
  } else if (step === "compare" && update.checks) {
    findings.push(`${update.checks.filter((check) => check.outcome === "pass").length} purchase-request check(s) passed`);
  } else if (step === "rules" && update.checks) {
    findings.push(`${update.checks.filter((check) => check.outcome === "pass").length} contract check(s) passed`);
  } else if (step === "financial" && update.checks) {
    findings.push(`${update.checks.filter((check) => check.outcome === "pass").length} financial check(s) passed`);
  } else if (step === "decide" && update.decision) {
    findings.push(`Decision: ${update.decision}`);
  }
  return {
    step,
    status: trace?.note?.startsWith("error:") ? "failed" : "completed",
    note: trace?.note,
    findings,
    decision: update.decision ?? undefined,
  };
}

export async function* streamVerification(input: {
  fileName: string; bytes: Uint8Array; prCsv: string; mode?: ExtractorMode; signal?: AbortSignal;
}): AsyncGenerator<VerificationProgress | VerificationResult> {
  const stream = await graph.stream({
    fileName: input.fileName, pdfBytes: input.bytes, prCsv: input.prCsv,
    extractorMode: input.mode ?? resolveMode(),
    extraction: null, decision: null, processingError: null, result: null,
  }, { streamMode: "updates", signal: input.signal } as never);
  for await (const update of stream) {
    for (const [nodeName, value] of Object.entries(update as Record<string, Partial<S>>)) {
      const progress = progressFor(nodeName, value);
      if (progress) yield progress;
      if (nodeName === "report" && value.result) yield value.result;
    }
  }
}

export async function runVerification(input: {
  fileName: string; bytes: Uint8Array; prCsv: string; mode?: ExtractorMode;
}): Promise<VerificationResult> {
  const out = await graph.invoke({
    fileName: input.fileName, pdfBytes: input.bytes, prCsv: input.prCsv,
    extractorMode: input.mode ?? resolveMode(),
    extraction: null, decision: null, processingError: null, result: null,
  });
  return out.result!;
}
