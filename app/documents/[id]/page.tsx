"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Download, Printer, UserCheck } from "lucide-react";
import { Button, Card, CardHeader, DecisionBadge, OutcomeBadge } from "@/components/ui";
import { useStore } from "@/lib/client-store";
import { download } from "@/lib/export-csv";
import { DECISION_LABEL, type Check, type Decision, type Field, type VerificationResult } from "@/lib/types";

const show = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${x ?? "—"}`).join(", ");
  return String(v);
};

function fieldRows(r: VerificationResult): { label: string; f: Field<unknown> }[] {
  const ex = r.extraction;
  if (!ex) return [];
  const out: { label: string; f: Field<unknown> }[] = [
    { label: "Supplier name", f: ex.supplierName }, { label: "Supplier TIN", f: ex.supplierTin }, { label: "Supplier BIN", f: ex.supplierBin },
    { label: "Quotation number", f: ex.quotationNumber }, { label: "Quotation date", f: ex.quotationDate }, { label: "Purchase request", f: ex.prReference },
    { label: "Currency", f: ex.currency },
  ];
  ex.items.forEach((it, i) => {
    const t = ex.items.length > 1 ? ` (line ${i + 1})` : "";
    out.push(
      { label: `Item${t}`, f: it.itemId }, { label: `Description${t}`, f: it.description }, { label: `Unit${t}`, f: it.unit },
      { label: `Quantity${t}`, f: it.quantity }, { label: `Unit price${t}`, f: it.unitPrice }, { label: `Line total${t}`, f: it.lineTotal },
    );
  });
  out.push(
    { label: "Subtotal", f: ex.subtotal }, { label: "VAT %", f: ex.vatPercent }, { label: "VAT amount", f: ex.vatAmount }, { label: "Grand total", f: ex.grandTotal },
    { label: "Advance payment %", f: ex.advancePercent }, { label: "Balance payment", f: ex.balancePayment }, { label: "Delivery", f: ex.delivery },
    { label: "Late-delivery penalty", f: ex.penalty }, { label: "Quotation validity", f: ex.validity },
  );
  return out;
}

const statusColor = { extracted: "text-emerald-700", missing: "text-red-600", unclear: "text-amber-700" } as const;

function CheckTable({ checks }: { checks: Check[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
          <tr><th className="px-4 py-2">Check</th><th className="px-4 py-2">Result</th><th className="px-4 py-2">Expected</th><th className="px-4 py-2">Found</th><th className="px-4 py-2">Explanation & evidence</th></tr>
        </thead>
        <tbody className="divide-y divide-navy-100 align-top">
          {checks.map((c) => (
            <tr key={c.id} className={c.outcome === "reject" ? "bg-red-50/40" : c.outcome === "review" ? "bg-amber-50/40" : ""}>
              <td className="px-4 py-3"><div className="font-medium">{c.title}</div>{c.rule && <div className="text-[11px] text-navy-500">{c.rule}</div>}</td>
              <td className="px-4 py-3"><OutcomeBadge outcome={c.outcome} /></td>
              <td className="px-4 py-3 text-xs">{c.expected ?? "—"}</td>
              <td className="px-4 py-3 text-xs">{c.actual ?? "—"}</td>
              <td className="px-4 py-3 text-xs">
                <div>{c.message}</div>
                {c.quote && <blockquote className="mt-1 border-l-2 border-brand/40 pl-2 italic text-navy-500">“{c.quote.replace(/\s+/g, " ")}”{c.page ? ` — page ${c.page}` : ""}</blockquote>}
                {c.outcome !== "pass" && c.action && <div className="mt-1 font-medium text-navy-700">Recommended: {c.action}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const { results, reviews, ready, saveReview } = useStore();
  const [note, setNote] = useState("");
  const r = results[id];
  const review = reviews[id];

  if (!ready) return <p className="text-sm text-navy-500">Loading…</p>;
  if (!r) {
    return (
      <div className="space-y-3">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-brand"><ArrowLeft size={14} /> Back</Link>
        <p className="text-sm text-navy-700">This document is not in your browser&apos;s stored results. Results are kept locally; re-run the verification from the main page.</p>
      </div>
    );
  }
  const decide = (d: Decision) => saveReview(id, { decision: d, note, at: new Date().toISOString() });
  const contract = r.checks.filter((c) => c.group === "contract");
  const purchase = r.checks.filter((c) => c.group === "purchase_request");
  const extraction = r.checks.filter((c) => c.group === "extraction");

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-brand"><ArrowLeft size={14} /> All documents</Link>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => window.print()}><Printer size={14} /> Print / Save as PDF</Button>
          <Button variant="ghost" onClick={() => download(`${r.fileName}.report.json`, JSON.stringify(r, null, 2), "application/json")}><Download size={14} /> JSON</Button>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">{r.supplierName ?? "Unknown supplier"}</h1>
            <p className="mt-0.5 text-sm text-navy-500">{r.quotationNumber ?? "No quotation number"} · {r.prReference ?? "No PR reference"} · Item {r.itemId ?? "?"} · {r.fileName}</p>
          </div>
          <DecisionBadge decision={r.decision} className="px-3 py-1 text-sm" />
        </div>
        <p className="mt-3 rounded-lg bg-navy-50 p-3 text-sm">{r.summary}</p>
        <p className="mt-2 text-xs text-navy-500">Extraction mode: <b>{r.extractorMode}</b>{r.extractorMode === "heuristic" ? " (rule-based parser, no AI)" : ""} · Processed {new Date(r.processedAt).toLocaleString()}</p>
      </Card>

      {r.decision === "NEEDS_REVIEW" && (
        <Card className="no-print border-amber-200">
          <CardHeader title="Human review" sub="The system stopped here instead of guessing. Record the reviewer's decision (stored in this browser only)." />
          <div className="space-y-3 p-4">
            {review ? (
              <p className="flex items-center gap-2 text-sm"><UserCheck size={16} className="text-brand" /> Reviewer decided <b>{DECISION_LABEL[review.decision]}</b>{review.note ? ` — “${review.note}”` : ""}
                <button className="ml-2 text-xs text-brand underline" onClick={() => saveReview(id, null)}>undo</button></p>
            ) : (
              <>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / note (optional)" className="w-full rounded-lg border border-navy-100 p-2 text-sm outline-none focus:border-brand" rows={2} />
                <div className="flex gap-2">
                  <Button onClick={() => decide("APPROVE")}>Approve</Button>
                  <Button variant="ghost" onClick={() => decide("REJECT")}>Reject</Button>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {r.processingError ? (
        <Card className="p-4 text-sm text-navy-700">Processing stopped early, so no field-level report exists. Fix the input and run it again.</Card>
      ) : (
        <>
          {r.triggered.length > 0 && (
            <Card>
              <CardHeader title="Triggered rules" sub="Why this document was not approved outright" />
              <CheckTable checks={r.triggered} />
            </Card>
          )}

          <Card>
            <CardHeader title="Purchase request comparison" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-navy-50 text-xs uppercase tracking-wide text-navy-500"><tr><th className="px-4 py-2">Field</th><th className="px-4 py-2">Requested</th><th className="px-4 py-2">Quoted</th><th className="px-4 py-2">Difference</th><th className="px-4 py-2">Status</th></tr></thead>
                <tbody className="divide-y divide-navy-100">
                  {r.comparison.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-navy-500">The quotation could not be matched to a purchase request line.</td></tr>}
                  {r.comparison.map((c) => (
                    <tr key={c.label} className={c.status === "reject" ? "bg-red-50/40" : c.status === "review" ? "bg-amber-50/40" : ""}>
                      <td className="px-4 py-2 font-medium">{c.label}</td><td className="px-4 py-2">{c.requested}</td><td className="px-4 py-2">{c.quoted}</td><td className="px-4 py-2">{c.difference}</td><td className="px-4 py-2"><OutcomeBadge outcome={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CheckTable checks={purchase} />
          </Card>

          <Card><CardHeader title="Contract compliance checklist" /><CheckTable checks={contract} /></Card>

          <Card>
            <CardHeader title="Financial calculations" sub="Recomputed with decimal arithmetic; one paisa of rounding is tolerated." />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-navy-50 text-xs uppercase tracking-wide text-navy-500"><tr><th className="px-4 py-2">Figure</th><th className="px-4 py-2">Formula</th><th className="px-4 py-2">Recalculated (BDT)</th><th className="px-4 py-2">In document (BDT)</th><th className="px-4 py-2">Status</th></tr></thead>
                <tbody className="divide-y divide-navy-100">
                  {r.financial.map((f) => (
                    <tr key={f.label} className={f.ok === false ? "bg-amber-50/40" : ""}>
                      <td className="px-4 py-2 font-medium">{f.label}</td><td className="px-4 py-2 text-xs">{f.formula}</td><td className="px-4 py-2">{f.expected ?? "—"}</td><td className="px-4 py-2">{f.documented ?? "—"}</td>
                      <td className="px-4 py-2"><OutcomeBadge outcome={f.ok === null ? "review" : f.ok ? "pass" : "review"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="Extracted information" sub="Every value is shown with the exact text it came from. Quotes that could not be found in the PDF text downgrade the field to “unclear”." />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-navy-50 text-xs uppercase tracking-wide text-navy-500"><tr><th className="px-4 py-2">Field</th><th className="px-4 py-2">Value</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Source text</th></tr></thead>
                <tbody className="divide-y divide-navy-100 align-top">
                  {fieldRows(r).map(({ label, f }) => (
                    <tr key={label}>
                      <td className="px-4 py-2 font-medium">{label}</td>
                      <td className="px-4 py-2">{show(f.value)}</td>
                      <td className={`px-4 py-2 text-xs font-semibold ${statusColor[f.status]}`}>{f.status}</td>
                      <td className="px-4 py-2 text-xs italic text-navy-500">{f.quote ? `“${f.quote.replace(/\s+/g, " ")}”${f.page ? ` — p.${f.page}` : ""}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {extraction.length > 0 && <CheckTable checks={extraction} />}
          </Card>
        </>
      )}

      <Card>
        <CardHeader title="Pipeline trace" sub="Fixed sequence of steps that ran for this document" />
        <ol className="divide-y divide-navy-100 text-sm">
          {r.trace.map((t, i) => (
            <li key={i} className="flex justify-between gap-3 px-4 py-2"><span>{t.node}{t.note && <span className="ml-2 text-xs text-navy-500">{t.note}</span>}</span><span className="text-xs text-navy-500">{t.ms} ms</span></li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
