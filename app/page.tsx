"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Download, FileText, FlaskConical, Loader2, Play, Search, Trash2, Upload, UserCheck, XCircle } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, CardHeader, DecisionBadge } from "@/components/ui";
import { useStore } from "@/lib/client-store";
import { download, resultsToCsv } from "@/lib/export-csv";
import { DECISION_LABEL, type Decision, type VerificationResult } from "@/lib/types";
import { apiUrl } from "@/lib/client-api";

interface SamplesInfo {
  samples: string[]; missingSamples: string[]; hasPurchaseRequest: boolean; hasRules: boolean; extractorMode: string;
}
type Queued = { key: string; file?: File; sample?: string; name: string; state: "queued" | "running" | "done" | "error" | "cancelled"; error?: string };

async function fingerprint(f: File) {
  try {
    const d = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
    return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return `${f.name}:${f.size}`; }
}

export default function Page() {
  const { results, reviews, ready, saveResult, clear } = useStore();
  const [info, setInfo] = useState<SamplesInfo | null>(null);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [prFile, setPrFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [filter, setFilter] = useState<"ALL" | Decision>("ALL");
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { fetch(apiUrl("/api/samples")).then((r) => r.json()).then(setInfo).catch(() => setInfo(null)); }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const msgs: string[] = [];
    const next: Queued[] = [];
    const seen = new Set(queue.map((q) => q.key));
    for (const f of Array.from(files)) {
      if (f.name.toLowerCase().endsWith(".csv")) { setPrFile(f); msgs.push(`Using ${f.name} as the purchase request.`); continue; }
      if (!f.name.toLowerCase().endsWith(".pdf")) { msgs.push(`${f.name}: unsupported file type (PDF or CSV only).`); continue; }
      if (f.size > 4 * 1024 * 1024) { msgs.push(`${f.name}: larger than 4 MB, skipped.`); continue; }
      const key = await fingerprint(f);
      if (seen.has(key)) { msgs.push(`${f.name}: duplicate of a file already selected, skipped.`); continue; }
      seen.add(key);
      next.push({ key, file: f, name: f.name, state: "queued" });
    }
    setQueue((q) => [...q, ...next]);
    setNotice(msgs.length ? msgs.join(" ") : null);
  }, [queue]);

  const runQueue = useCallback(async (items: Queued[]) => {
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    for (const it of items) {
      if (controller.signal.aborted) break;
      setQueue((q) => q.map((x) => (x.key === it.key ? { ...x, state: "running" } : x)));
      try {
        const fd = new FormData();
        if (it.file) fd.append("file", it.file); else fd.append("sample", it.sample!);
        if (prFile) fd.append("pr", prFile);
        const res = await fetch(apiUrl("/api/verify"), { method: "POST", body: fd, signal: controller.signal });
        const text = await res.text();
        let body: { error?: string };
        try {
          body = JSON.parse(text) as { error?: string };
        } catch {
          throw new Error(`Verification failed (${res.status}). The server did not return a JSON result.`);
        }
        if (!res.ok) throw new Error(body.error || "Request failed");
        saveResult(body as VerificationResult);
        setQueue((q) => q.map((x) => (x.key === it.key ? { ...x, state: "done" } : x)));
      } catch (e) {
        if (controller.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) {
          setQueue((q) => q.map((x) => x.key === it.key ? { ...x, state: "cancelled" } : x));
          break;
        }
        setQueue((q) => q.map((x) => (x.key === it.key ? { ...x, state: "error", error: (e as Error).message } : x)));
      }
    }
    if (controller.signal.aborted) {
      setQueue((q) => q.map((x) => x.state === "queued" ? { ...x, state: "cancelled" } : x));
    }
    abortRef.current = null;
    setRunning(false);
  }, [prFile, saveResult]);

  const cancelVerification = () => {
    abortRef.current?.abort();
  };

  const runSamples = () => {
    if (!info) return;
    const items: Queued[] = info.samples.map((s) => ({ key: `sample:${s}`, sample: s, name: s, state: "queued" }));
    setQueue(items);
    runQueue(items);
  };
  const runUploaded = () => runQueue(queue.filter((q) => q.state === "queued" || q.state === "error"));

  const rows = useMemo(() => Object.values(results).sort((a, b) => a.fileName.localeCompare(b.fileName)), [results]);
  const final = (r: VerificationResult): Decision => reviews[r.docId]?.decision ?? r.decision;
  const counts = useMemo(() => {
    const c = { APPROVE: 0, REJECT: 0, NEEDS_REVIEW: 0 };
    rows.forEach((r) => c[r.decision]++);
    return c;
  }, [rows]);
  const filtered = rows.filter((r) => {
    if (filter !== "ALL" && r.decision !== filter) return false;
    const q = search.trim().toLowerCase();
    return !q || [r.supplierName, r.quotationNumber, r.fileName, r.itemId].some((v) => v?.toLowerCase().includes(q));
  });
  const doneCount = queue.filter((q) => q.state === "done" || q.state === "error" || q.state === "cancelled").length;
  const chart = [
    { name: "Approve", value: counts.APPROVE, fill: "#10b981" },
    { name: "Reject", value: counts.REJECT, fill: "#ef4444" },
    { name: "Needs a person", value: counts.NEEDS_REVIEW, fill: "#f59e0b" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Supplier document verification</h1>
        <p className="mt-1 text-sm text-navy-500">Each quotation runs through fixed steps. AI reads the document; code makes the decision. When unsure, it asks a person.</p>
      </div>

      {info && info.extractorMode === "heuristic" && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>No <code>OPENROUTER_API_KEY</code> is configured on the server, so documents are read by the rule-based parser, not by AI. Decisions are still deterministic, but this mode is tuned to the sample layout only.</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Documents processed", rows.length, "text-navy-900"],
          ["Approved", counts.APPROVE, "text-emerald-600"],
          ["Rejected", counts.REJECT, "text-red-600"],
          ["Needs a person", counts.NEEDS_REVIEW, "text-amber-600"],
          ["Human-reviewed", Object.keys(reviews).filter((k) => results[k]).length, "text-brand"],
        ].map(([label, n, color]) => (
          <Card key={label as string} className="p-4">
            <div className="text-xs font-medium text-navy-500">{label}</div>
            <div className={`mt-1 text-2xl font-semibold ${color}`}>{n}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Run verification" sub="Upload supplier PDFs (and optionally a purchase request CSV), or run the bundled sample dataset." />
          <div className="space-y-3 p-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${drag ? "border-brand bg-brand-soft" : "border-navy-100 hover:bg-navy-50"}`}
            >
              <Upload className="text-navy-500" size={22} />
              <div className="text-sm font-medium">Drop PDFs here, or click to choose</div>
              <div className="text-xs text-navy-500">PDF up to 4 MB each. A .csv file is used as the purchase request.</div>
              <input ref={inputRef} type="file" multiple accept=".pdf,.csv" className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
            </div>
            {notice && <p className="text-xs text-amber-700">{notice}</p>}
            {prFile && <p className="text-xs text-navy-500">Purchase request: <b>{prFile.name}</b> <button className="ml-1 text-brand underline" onClick={() => setPrFile(null)}>use bundled</button></p>}

            {queue.length > 0 && (
              <ul className="divide-y divide-navy-100 rounded-lg border border-navy-100 text-sm">
                {queue.map((q) => (
                  <li key={q.key} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2"><FileText size={14} className="shrink-0 text-navy-500" /><span className="truncate">{q.name}</span></span>
                    <span className="flex shrink-0 items-center gap-1 text-xs">
                      {q.state === "queued" && <span className="text-navy-500">Ready</span>}
                      {q.state === "running" && <><Loader2 size={13} className="animate-spin text-brand" /> Verifying</>}
                      {q.state === "done" && <><CheckCircle2 size={13} className="text-emerald-600" /> Done</>}
                      {q.state === "error" && <span className="text-red-600" title={q.error}><XCircle size={13} className="inline" /> {q.error}</span>}
                      {q.state === "cancelled" && <span className="text-navy-500"><XCircle size={13} className="inline" /> Cancelled</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {running && (
              <div>
                <div className="h-1.5 overflow-hidden rounded bg-navy-100"><div className="h-full bg-brand transition-all" style={{ width: `${(doneCount / Math.max(queue.length, 1)) * 100}%` }} /></div>
                <p className="mt-1 text-xs text-navy-500">{doneCount} of {queue.length} documents processed</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={runUploaded} disabled={running || !queue.some((q) => q.file && (q.state === "queued" || q.state === "error"))}>
                <Play size={15} /> Run Verification
              </Button>
              <Button variant="ghost" onClick={runSamples} disabled={running || !info || info.samples.length === 0 || !info.hasPurchaseRequest}>
                <FlaskConical size={15} /> Use sample dataset ({info?.samples.length ?? 0} files)
              </Button>
              {running && <Button variant="ghost" onClick={cancelVerification}><XCircle size={15} /> Cancel</Button>}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Decision distribution" />
          <div className="h-52 p-3">
            {rows.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-navy-500">No results yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "#f4f6fb" }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>{chart.map((c) => <Cell key={c.name} fill={c.fill} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Verification results"
          sub={ready ? `${filtered.length} of ${rows.length} documents` : "Loading…"}
          right={
            <div className="flex gap-2">
              <Button variant="ghost" disabled={!rows.length} onClick={() => download("veriq-results.csv", resultsToCsv(rows, reviews), "text/csv")}><Download size={14} /> Export CSV</Button>
              <Button variant="ghost" disabled={!rows.length} onClick={() => { if (confirm("Clear all stored results and reviews from this browser?")) clear(); }}><Trash2 size={14} /></Button>
            </div>
          }
        />
        <div className="flex flex-wrap gap-2 border-b border-navy-100 p-3">
          <div className="relative min-w-[12rem] flex-1">
            <Search size={14} className="absolute left-2.5 top-2.5 text-navy-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search supplier, quotation, file…" className="w-full rounded-lg border border-navy-100 py-2 pl-8 pr-3 text-sm outline-none focus:border-brand" />
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value as "ALL" | Decision)} className="rounded-lg border border-navy-100 bg-white px-3 py-2 text-sm">
            <option value="ALL">All statuses</option>
            <option value="APPROVE">{DECISION_LABEL.APPROVE}</option>
            <option value="REJECT">{DECISION_LABEL.REJECT}</option>
            <option value="NEEDS_REVIEW">{DECISION_LABEL.NEEDS_REVIEW}</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
              <tr><th className="px-4 py-2">Supplier</th><th className="px-4 py-2">Quotation</th><th className="px-4 py-2">Item</th><th className="px-4 py-2">Decision</th><th className="px-4 py-2">Issues</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-navy-500">{rows.length ? "No documents match the filter." : "Run a verification to see results."}</td></tr>}
              {filtered.map((r) => (
                <tr key={r.docId} className="hover:bg-navy-50/60">
                  <td className="px-4 py-3"><div className="font-medium">{r.supplierName ?? "Unknown"}</div><div className="text-xs text-navy-500">{r.fileName}</div></td>
                  <td className="px-4 py-3">{r.quotationNumber ?? "—"}</td>
                  <td className="px-4 py-3">{r.itemId ?? "—"}</td>
                  <td className="px-4 py-3">
                    <DecisionBadge decision={r.decision} />
                    {reviews[r.docId] && <div className="mt-1 flex items-center gap-1 text-[11px] text-brand"><UserCheck size={12} /> Person: {DECISION_LABEL[final(r)]}</div>}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs text-navy-700">{r.decision === "APPROVE" ? "No issues" : <span className="line-clamp-2">{r.summary}</span>}</td>
                  <td className="px-4 py-3 text-right"><Link href={`/documents/${r.docId}`} className="inline-flex items-center text-brand hover:underline">Details <ChevronRight size={14} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
