import type { Check, Extraction, FinancialLine } from "@/lib/types";
import { D, fmtMoney, moneyEq } from "@/lib/money";
import { RULES } from "./config";
import { pg, q, usable } from "./util";

/** Node 6: recompute every figure independently with decimal arithmetic. */
export function verifyFinancials(ex: Extraction): { checks: Check[]; lines: FinancialLine[] } {
  const checks: Check[] = [];
  const lines: FinancialLine[] = [];
  const G = "financial" as const;

  const add = (
    id: string, title: string, label: string, formula: string,
    expected: ReturnType<typeof D> | null, documented: number | undefined,
    quote: string | null, page: number | null, missingMsg: string,
  ) => {
    if (expected === null || documented === undefined) {
      checks.push({ id, group: G, title, rule: "Review #6", outcome: "review", message: missingMsg,
        expected: expected ? fmtMoney(expected) : undefined, actual: documented === undefined ? "not found" : fmtMoney(documented),
        quote, page, action: "Verify the figures against the document manually." });
      lines.push({ label, formula, expected: expected ? fmtMoney(expected) : null, documented: documented === undefined ? null : fmtMoney(documented), ok: null });
      return;
    }
    const ok = moneyEq(expected, documented);
    checks.push({ id, group: G, title, rule: "Review #6", outcome: ok ? "pass" : "review",
      message: ok ? `${label} is correct (${fmtMoney(documented)}).` : `${label} does not add up: document shows ${fmtMoney(documented)}, recalculated ${fmtMoney(expected)}.`,
      expected: fmtMoney(expected), actual: fmtMoney(documented), quote, page,
      action: ok ? undefined : "Ask the supplier to correct the figures, or confirm which figure is right." });
    lines.push({ label, formula, expected: fmtMoney(expected), documented: fmtMoney(documented), ok });
  };

  /* line totals */
  const lineTotals: ReturnType<typeof D>[] = [];
  let allLinesKnown = ex.items.length > 0;
  ex.items.forEach((it, i) => {
    const qty = usable(it.quantity);
    const price = usable(it.unitPrice);
    const tag = ex.items.length > 1 ? ` (line ${i + 1})` : "";
    const exp = qty !== undefined && price !== undefined ? D(qty).times(price) : null;
    if (exp === null) allLinesKnown = false;
    else lineTotals.push(exp);
    add(`line_total_${i}`, `Line total${tag}`, `Line total${tag}`, "quantity × unit price", exp, usable(it.lineTotal),
      q(it.lineTotal), pg(it.lineTotal), `Line total${tag} cannot be verified (quantity, price or amount missing).`);
  });

  /* subtotal */
  const subtotalExp = allLinesKnown ? lineTotals.reduce((a, b) => a.plus(b), D(0)) : null;
  add("subtotal", "Subtotal", "Subtotal", "Σ line totals", subtotalExp, usable(ex.subtotal), q(ex.subtotal), pg(ex.subtotal),
    "Subtotal cannot be verified.");

  /* VAT amount — recomputed from the documented subtotal when present so errors are not double counted */
  const subBase = usable(ex.subtotal);
  const vatPct = usable(ex.vatPercent);
  const vatExp = subBase !== undefined && vatPct !== undefined ? D(subBase).times(vatPct).div(100) : null;
  add("vat_amount", "VAT amount", "VAT amount", `subtotal × ${vatPct ?? RULES.vatPct}%`, vatExp, usable(ex.vatAmount),
    q(ex.vatAmount), pg(ex.vatAmount), "VAT amount cannot be verified.");

  /* grand total */
  const vatDoc = usable(ex.vatAmount);
  const totalExp = subBase !== undefined && vatDoc !== undefined ? D(subBase).plus(vatDoc) : null;
  add("grand_total", "Grand total", "Grand total", "subtotal + VAT", totalExp, usable(ex.grandTotal), q(ex.grandTotal), pg(ex.grandTotal),
    "Grand total cannot be verified.");

  return { checks, lines };
}
