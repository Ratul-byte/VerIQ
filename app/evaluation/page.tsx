"use client";
import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { Button, Card, CardHeader, DecisionBadge } from "@/components/ui";
import { CLASSES, summarizeEval, type EvalRow, type EvalSummary } from "@/lib/evaluation/metrics";
import { DECISION_LABEL, type Decision, type VerificationResult } from "@/lib/types";

interface Label { file: string; expected: Decision; reason: string; verified: boolean }
interface RowX extends EvalRow { reason: string; why?: string }

const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);

export default function EvaluationPage() {
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<RowX[] | null>(null);
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [expectedDocs, setExpectedDocs] = useState<number>(0);
  const [mode, setMode] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setRunning(true); setErr(null); setRows(null); setSummary(null);
    try {
      const info = await (await fetch("/api/samples")).json();
      const gt = await (await fetch("/api/ground-truth")).json();
      setMode(info.extractorMode);
      const labels: Label[] = (gt.labels ?? []).filter((l: Label) => l.verified && info.samples.includes(l.file));
      setExpectedDocs(info.samples.length + info.missingSamples.length);
      const out: RowX[] = [];
      for (const l of labels) {
        const fd = new FormData();
        fd.append("sample", l.file);
        let predicted: Decision | null = null, why: string | undefined, procErr: string | null = null;
        try {
          const res = await fetch("/api/verify", { method: "POST", body: fd });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error);
          const r = body as VerificationResult;
          procErr = r.processingError;
          predicted = r.processingError ? null : r.decision;
          why = r.processingError ?? r.summary;
        } catch (e) { why = (e as Error).message; }
        out.push({ file: l.file, expected: l.expected, predicted, reason: l.reason, why, processingError: procErr });
      }
      setRows(out);
      setSummary(summarizeEval(out));
    } catch (e) { setErr((e as Error).message || "Evaluation failed"); }
    setRunning(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Evaluation</h1>
        <p className="mt-1 text-sm text-navy-500">Runs every bundled sample through the pipeline and compares the result with hand-labelled ground truth. The verification engine never sees the labels.</p>
      </div>
      <Button onClick={run} disabled={running}>{running ? <Loader2 size={15} className="animate-spin" /> : <FlaskConical size={15} />} Run benchmark</Button>
      {err && <p className="text-sm text-red-600">{err}</p>}

      {summary && rows && (
        <>
          <div className="rounded-lg border border-navy-100 bg-white p-3 text-sm text-navy-700">
            Benchmark covers <b>{summary.labelled}</b> labelled document(s) out of <b>{expectedDocs}</b> expected. {summary.labelled < 10 && "This is not a 10-document evaluation, and a sample this small does not support statistical claims."} Extraction mode: <b>{mode}</b>.
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Labelled documents", summary.labelled], ["Processed", summary.processed], ["Processing failures", summary.failures],
              ["Correct", summary.correct], ["Incorrect", summary.incorrect], ["Accuracy", pct(summary.accuracy)],
            ].map(([l, v]) => (
              <Card key={l as string} className="p-4"><div className="text-xs text-navy-500">{l}</div><div className="mt-1 text-2xl font-semibold">{v}</div></Card>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Confusion matrix" sub="Rows = expected, columns = predicted" />
              <div className="overflow-x-auto p-4">
                <table className="w-full text-center text-sm">
                  <thead><tr><th /> {CLASSES.map((c) => <th key={c} className="px-2 py-1 text-xs font-medium text-navy-500">{DECISION_LABEL[c]}</th>)}</tr></thead>
                  <tbody>
                    {CLASSES.map((e) => (
                      <tr key={e}><th className="px-2 py-1 text-left text-xs font-medium text-navy-500">{DECISION_LABEL[e]}</th>
                        {CLASSES.map((p) => <td key={p} className={`px-2 py-2 font-semibold ${e === p ? "bg-emerald-50 text-emerald-700" : summary.confusion[e][p] ? "bg-red-50 text-red-700" : "text-navy-300"}`}>{summary.confusion[e][p]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card>
              <CardHeader title="Precision / recall / F1" sub="Per class; n/a means the class has no examples" />
              <table className="w-full text-sm">
                <thead className="bg-navy-50 text-xs uppercase text-navy-500"><tr><th className="px-4 py-2 text-left">Class</th><th className="px-2 py-2">Support</th><th className="px-2 py-2">Precision</th><th className="px-2 py-2">Recall</th><th className="px-2 py-2">F1</th></tr></thead>
                <tbody className="divide-y divide-navy-100 text-center">
                  {CLASSES.map((c) => { const m = summary.perClass[c]; return (
                    <tr key={c}><td className="px-4 py-2 text-left font-medium">{DECISION_LABEL[c]}</td><td>{m.support}</td><td>{pct(m.precision)}</td><td>{pct(m.recall)}</td><td>{pct(m.f1)}</td></tr>
                  ); })}
                </tbody>
              </table>
            </Card>
          </div>

          <Card>
            <CardHeader title="Per-document evaluation" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-navy-50 text-xs uppercase tracking-wide text-navy-500"><tr><th className="px-4 py-2">File</th><th className="px-4 py-2">Expected</th><th className="px-4 py-2">Predicted</th><th className="px-4 py-2">Result</th><th className="px-4 py-2">Explanation</th></tr></thead>
                <tbody className="divide-y divide-navy-100 align-top">
                  {rows.map((r) => {
                    const okRow = r.predicted === r.expected;
                    return (
                      <tr key={r.file}>
                        <td className="px-4 py-3 font-medium">{r.file}</td>
                        <td className="px-4 py-3"><DecisionBadge decision={r.expected} /></td>
                        <td className="px-4 py-3">{r.predicted ? <DecisionBadge decision={r.predicted} /> : <span className="text-red-600">failed</span>}</td>
                        <td className={`px-4 py-3 font-semibold ${okRow ? "text-emerald-700" : "text-red-600"}`}>{okRow ? "Correct" : "Incorrect"}</td>
                        <td className="px-4 py-3 text-xs text-navy-700">{okRow ? r.reason : `System said: ${r.why ?? "n/a"} — Expected because: ${r.reason}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
