"use client";
import { useMemo } from "react";
import { Card, CardHeader, DecisionBadge } from "@/components/ui";
import { evaluateResults } from "@/lib/evaluation/evaluate";
import { SUPPLIER_PACKS } from "@/lib/evaluation/reference";
import { CLASSES, summarizeEval, type EvalSummary } from "@/lib/evaluation/metrics";
import { useStore } from "@/lib/client-store";
import { DECISION_LABEL } from "@/lib/types";

const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);

export default function EvaluationPage() {
  const { results, ready } = useStore();
  const rows = useMemo(() => evaluateResults(Object.values(results)), [results]);
  const summary = useMemo<EvalSummary>(() => summarizeEval(rows), [rows]);
  const missing = SUPPLIER_PACKS.filter((pack) => !rows.some((row) => row.file === pack.file));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Evaluation</h1>
        <p className="mt-1 text-sm text-navy-500">Checks saved Verification results against the supplier-pack reference using deterministic rules. No model or PDF reprocessing is used here.</p>
      </div>
      {ready && (
        <>
          <div className="rounded-lg border border-navy-100 bg-white p-3 text-sm text-navy-700">
            Found <b>{summary.labelled}</b> saved result(s) matching <b>{SUPPLIER_PACKS.length}</b> supplier packs. {missing.length > 0 && <><b>{missing.length}</b> pack(s) have not been verified yet.</>}
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
                        <td className="px-4 py-3 text-xs text-navy-700">
                          {okRow ? r.reason : `System said: ${r.why ?? "n/a"} — Expected because: ${r.reason}`}
                          {r.evidence.length > 0 && <div className="mt-1 text-red-600">Evidence mismatches: {r.evidence.join(", ")}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          {missing.length > 0 && (
            <Card>
              <CardHeader title="Not yet evaluated" sub="These supplier-pack references have no saved Verification result." />
              <ul className="list-disc space-y-1 px-6 pb-4 text-sm text-navy-700">
                {missing.map((pack) => <li key={pack.file}>{pack.file} ({pack.quotationNumber})</li>)}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
