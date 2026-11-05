import type { PageText } from "@/lib/types";

export const collapse = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function locatePage(pages: PageText[], quote: string | null): number | null {
  if (!quote) return null;
  const nq = collapse(quote);
  if (!nq) return null;
  const hit = pages.find((p) => collapse(p.text).includes(nq));
  return hit ? hit.page : null;
}

export function numbersIn(s: string): number[] {
  const m = s.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/\d+(?:\.\d+)?/g);
  return m ? m.map(Number) : [];
}

export const fullText = (pages: PageText[]) => pages.map((p) => p.text).join("\n");
