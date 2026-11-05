"use client";
import { useCallback, useEffect, useState } from "react";
import type { Decision, VerificationResult } from "@/lib/types";

export interface HumanReview { decision: Decision; note: string; at: string }
const RESULTS = "veriq:results:v1";
const REVIEWS = "veriq:reviews:v1";
const EVT = "veriq:changed";

function read<T>(key: string): Record<string, T> {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or blocked: results stay in memory only */ }
  window.dispatchEvent(new Event(EVT));
}

export function useStore() {
  const [results, setResults] = useState<Record<string, VerificationResult>>({});
  const [reviews, setReviews] = useState<Record<string, HumanReview>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = () => { setResults(read(RESULTS)); setReviews(read(REVIEWS)); setReady(true); };
    load();
    window.addEventListener(EVT, load);
    window.addEventListener("storage", load);
    return () => { window.removeEventListener(EVT, load); window.removeEventListener("storage", load); };
  }, []);

  const saveResult = useCallback((r: VerificationResult) => write(RESULTS, { ...read<VerificationResult>(RESULTS), [r.docId]: r }), []);
  const clear = useCallback(() => { write(RESULTS, {}); write(REVIEWS, {}); }, []);
  const saveReview = useCallback((id: string, rv: HumanReview | null) => {
    const all = read<HumanReview>(REVIEWS);
    if (rv) all[id] = rv; else delete all[id];
    write(REVIEWS, all);
  }, []);

  return { results, reviews, ready, saveResult, saveReview, clear };
}
