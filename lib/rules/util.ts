import type { Field } from "@/lib/types";

/** Returns the value only when the field was positively extracted. */
export function usable<T>(f: Field<T> | undefined | null): T | undefined {
  if (!f || f.status !== "extracted" || f.value === null || f.value === undefined) return undefined;
  return f.value;
}

export const q = (f: Field<unknown> | undefined | null) => f?.quote ?? null;
export const pg = (f: Field<unknown> | undefined | null) => f?.page ?? null;

export const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
