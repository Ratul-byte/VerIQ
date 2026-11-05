/**
 * Single source of truth for every threshold. Mirrors data/company-rules.md.
 * Boundary handling (documented, and covered by tests/rules.test.ts):
 *
 *  price       > max by MORE than 3%   -> REJECT   | exactly 3% above max -> REVIEW
 *  advance     > 20%                   -> REJECT   | exactly 20%          -> pass
 *  delivery    > 45 days               -> REJECT   | 31..45 days (incl.)  -> REVIEW | <= 30 -> pass
 *  quantity    differs by MORE than 5% -> REVIEW   | exactly 5%           -> pass
 *  payment     30..60 days after delivery (inclusive) -> pass, otherwise REVIEW
 *  validity    < 30 days               -> REVIEW   | exactly 30 days      -> pass
 *  penalty     >= 0.5% of order value / week -> pass; 0 < p < 0.5 -> REVIEW; none or 0 -> REJECT
 *  VAT         must be shown separately at exactly 15%
 */
export const RULES = {
  currency: "BDT",
  priceRejectAbovePct: 3,
  advanceMaxPct: 20,
  deliveryReviewFromDays: 31,
  deliveryMaxDays: 45,
  quantityReviewAbovePct: 5,
  paymentMinDays: 30,
  paymentMaxDays: 60,
  vatPct: 15,
  validityMinDays: 30,
  penaltyMinPctPerWeek: 0.5,
} as const;
