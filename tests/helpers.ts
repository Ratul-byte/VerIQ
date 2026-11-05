import type { Extraction, Field, PrLine } from "@/lib/types";
import { comparePurchaseRequest } from "@/lib/rules/comparison";
import { checkContractRules } from "@/lib/rules/contract";
import { verifyFinancials } from "@/lib/rules/financial";
import { decide } from "@/lib/rules/decision";

export const PR_LINES: PrLine[] = [
  { prNumber: "PR-2026-114", itemId: "A", description: "Cotton twill fabric, 280 gsm", unit: "metre", quantity: 12000, maxUnitPrice: 480 },
  { prNumber: "PR-2026-114", itemId: "B", description: "Metal zipper, 18 cm", unit: "piece", quantity: 20000, maxUnitPrice: 38 },
];

export const ok = <T,>(value: T, quote = "q"): Field<T> => ({ status: "extracted", value, quote, page: 1 });
export const missing = <T,>(): Field<T> => ({ status: "missing", value: null, quote: null, page: null });
export const unclear = <T,>(quote = "q"): Field<T> => ({ status: "unclear", value: null, quote, page: 1 });

/** A fully compliant quotation for item A (mirrors supplier-pack-01). */
export function cleanExtraction(): Extraction {
  return {
    supplierName: ok("Padma Textile Mills Ltd"),
    supplierTin: ok("101458013391"),
    supplierBin: ok("000170141-0101"),
    quotationNumber: ok("QT-2026-901"),
    quotationDate: ok("2026-10-21"),
    prReference: ok("PR-2026-114"),
    currency: ok("BDT"),
    items: [{
      itemId: ok("A"), description: ok("Cotton twill fabric, 280 gsm"), unit: ok("metre"),
      quantity: ok(12000), unitPrice: ok(472), lineTotal: ok(5664000),
    }],
    subtotal: ok(5664000), vatPercent: ok(15), vatAmount: ok(849600), grandTotal: ok(6513600),
    advancePercent: ok(10),
    balancePayment: ok({ days: 45, basis: "after_delivery" as const }),
    delivery: ok({ value: 24, unit: "days" as const, from: "purchase_order" as const }),
    penalty: ok({ percent: 1, period: "week" as const, basis: "order_value" as const }),
    validity: ok({ days: 45, untilDate: null }),
  };
}

/** Sets qty/price and recomputes totals so tests isolate a single rule. */
export function withQtyPrice(ex: Extraction, qty: number, price: number): Extraction {
  const line = qty * price;
  const vat = Math.round(line * 15) / 100;
  ex.items[0].quantity = ok(qty);
  ex.items[0].unitPrice = ok(price);
  ex.items[0].lineTotal = ok(line);
  ex.subtotal = ok(line);
  ex.vatAmount = ok(vat);
  ex.grandTotal = ok(Math.round((line + vat) * 100) / 100);
  return ex;
}

export function evaluate(ex: Extraction, processingError: string | null = null) {
  const cmp = comparePurchaseRequest(ex, PR_LINES);
  const contract = checkContractRules(ex);
  const fin = verifyFinancials(ex);
  const checks = [...cmp.checks, ...contract, ...fin.checks];
  const { decision, triggered } = decide(checks, processingError);
  return { decision, triggered, checks, byId: (id: string) => checks.find((c) => c.id === id)! };
}
