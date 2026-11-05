import type { Check, Extraction } from "@/lib/types";
import { D, fmtPct } from "@/lib/money";
import { RULES } from "./config";
import { pg, q, usable } from "./util";

const G = "contract" as const;

/** Node 5: each company rule is evaluated independently. */
export function checkContractRules(ex: Extraction): Check[] {
  const checks: Check[] = [];

  /* --- TIN / BIN present (Reject #4) --- */
  for (const [key, label, f] of [
    ["tin", "Supplier TIN", ex.supplierTin],
    ["bin", "Supplier BIN", ex.supplierBin],
  ] as const) {
    const v = usable(f);
    if (v !== undefined) {
      checks.push({ id: key, group: G, title: `${label} present`, rule: "Reject #4", outcome: "pass",
        message: `${label} is stated.`, actual: v, quote: q(f), page: pg(f) });
    } else if (f.status === "missing") {
      checks.push({ id: key, group: G, title: `${label} present`, rule: "Reject #4", outcome: "reject",
        message: `${label} is missing from the document.`, expected: "present", actual: "missing", quote: q(f), page: pg(f) });
    } else {
      checks.push({ id: key, group: G, title: `${label} present`, rule: "Reject #4", outcome: "review",
        message: `${label} could not be read reliably.`, expected: "present", actual: "unclear", quote: q(f), page: pg(f),
        action: `Check the document for the ${label}.` });
    }
  }

  /* --- Advance payment (Reject #2: > 20%) --- */
  {
    const f = ex.advancePercent;
    const v = usable(f);
    if (v === undefined) {
      checks.push({ id: "advance", group: G, title: "Advance payment", rule: "Reject #2", outcome: "review",
        message: f.status === "missing" ? "No advance-payment term is stated; a 0% advance is not assumed." : "Advance payment is unclear.",
        expected: `≤ ${RULES.advanceMaxPct}%`, actual: f.status, quote: q(f), page: pg(f),
        action: "Confirm the advance payment percentage with the supplier." });
    } else {
      const bad = D(v).gt(RULES.advanceMaxPct);
      checks.push({ id: "advance", group: G, title: "Advance payment", rule: "Reject #2", outcome: bad ? "reject" : "pass",
        message: bad ? `Advance payment is ${v}%, above the ${RULES.advanceMaxPct}% limit.` : `Advance payment is ${v}% (limit ${RULES.advanceMaxPct}%).`,
        expected: `≤ ${RULES.advanceMaxPct}%`, actual: `${v}%`, quote: q(f), page: pg(f) });
    }
  }

  /* --- Late-delivery penalty (Reject #3 if absent; >= 0.5% / week) --- */
  {
    const f = ex.penalty;
    const v = usable(f);
    const title = "Late-delivery penalty";
    if (f.status === "missing") {
      checks.push({ id: "penalty", group: G, title, rule: "Reject #3", outcome: "reject",
        message: "The contract has no late-delivery penalty clause.", expected: `≥ ${RULES.penaltyMinPctPerWeek}% of order value per week`,
        actual: "no clause", quote: q(f), page: pg(f) });
    } else if (v === undefined) {
      checks.push({ id: "penalty", group: G, title, rule: "Reject #3", outcome: "review",
        message: "A penalty clause may exist but could not be read reliably.", expected: `≥ ${RULES.penaltyMinPctPerWeek}% per week`,
        actual: "unclear", quote: q(f), page: pg(f), action: "Read the delay clause and confirm the penalty rate." });
    } else if (D(v.percent).lte(0)) {
      checks.push({ id: "penalty", group: G, title, rule: "Reject #3", outcome: "reject",
        message: "The document states no effective late-delivery penalty (0%).", expected: `≥ ${RULES.penaltyMinPctPerWeek}% per week`,
        actual: "0%", quote: q(f), page: pg(f) });
    } else if (v.basis !== "order_value" || (v.period !== "week" && v.period !== "day")) {
      checks.push({ id: "penalty", group: G, title, rule: "Other notes", outcome: "review",
        message: "Penalty is not expressed as a percentage of order value per week or per day, so it cannot be compared automatically.",
        expected: `≥ ${RULES.penaltyMinPctPerWeek}% of order value per week`, actual: `${v.percent}% per ${v.period} of ${v.basis}`,
        quote: q(f), page: pg(f), action: "Convert the penalty to a weekly % of order value and judge manually." });
    } else {
      const perWeek = v.period === "day" ? D(v.percent).times(7) : D(v.percent);
      const bad = perWeek.lt(RULES.penaltyMinPctPerWeek);
      checks.push({ id: "penalty", group: G, title, rule: "Other notes", outcome: bad ? "review" : "pass",
        message: bad
          ? `Penalty is ${fmtPct(perWeek)} of order value per week, below the ${RULES.penaltyMinPctPerWeek}% minimum.`
          : `Penalty is ${fmtPct(perWeek)} of order value per week (minimum ${RULES.penaltyMinPctPerWeek}%).`,
        expected: `≥ ${RULES.penaltyMinPctPerWeek}% per week`, actual: `${fmtPct(perWeek)} per week`, quote: q(f), page: pg(f),
        action: bad ? "The rules set a minimum but no reject category; decide whether to accept or negotiate." : undefined });
    }
  }

  /* --- Delivery (Reject #5: > 45 days; Review #4: 31..45) --- */
  {
    const f = ex.delivery;
    const v = usable(f);
    const title = "Delivery period";
    const exp = `≤ ${RULES.deliveryReviewFromDays - 1} days (review ${RULES.deliveryReviewFromDays}–${RULES.deliveryMaxDays}, reject > ${RULES.deliveryMaxDays})`;
    if (v === undefined) {
      checks.push({ id: "delivery", group: G, title, rule: "Reject #5 / Review #4", outcome: "review",
        message: "Delivery period is missing or unclear.", expected: exp, actual: f.status, quote: q(f), page: pg(f),
        action: "Confirm the promised delivery period." });
    } else if (v.unit === "months" || v.unit === "working_days" || v.unit === "other" || v.from !== "purchase_order") {
      checks.push({ id: "delivery", group: G, title, rule: "Reject #5 / Review #4", outcome: "review",
        message: "Delivery period is not stated in calendar days/weeks from the purchase order, so it cannot be compared automatically.",
        expected: exp, actual: `${v.value} ${v.unit} from ${v.from}`, quote: q(f), page: pg(f),
        action: "Convert to calendar days from the purchase order and judge manually." });
    } else {
      const days = v.unit === "weeks" ? D(v.value).times(7) : D(v.value);
      const reject = days.gt(RULES.deliveryMaxDays);
      const review = !reject && days.gte(RULES.deliveryReviewFromDays);
      checks.push({ id: "delivery", group: G, title, rule: reject ? "Reject #5" : review ? "Review #4" : "Reject #5 / Review #4",
        outcome: reject ? "reject" : review ? "review" : "pass",
        message: reject ? `Delivery in ${days} days is later than ${RULES.deliveryMaxDays} days after the purchase order.`
          : review ? `Delivery in ${days} days falls in the ${RULES.deliveryReviewFromDays}–${RULES.deliveryMaxDays} day review band.`
          : `Delivery in ${days} days is within 30 days of the purchase order.`,
        expected: exp, actual: `${days} days`, quote: q(f), page: pg(f),
        action: review ? "Confirm the longer delivery time is acceptable." : undefined });
    }
  }

  /* --- Payment terms (Review #3: unclear or outside 30–60 days after delivery) --- */
  {
    const f = ex.balancePayment;
    const v = usable(f);
    const title = "Balance payment terms";
    const exp = `${RULES.paymentMinDays}–${RULES.paymentMaxDays} days after delivery`;
    if (v === undefined || v.days === null) {
      checks.push({ id: "payment", group: G, title, rule: "Review #3", outcome: "review",
        message: "Payment terms are missing or unclear.", expected: exp, actual: v ? "no day count" : f.status,
        quote: q(f), page: pg(f), action: "Clarify the balance payment terms." });
    } else if (v.basis !== "after_delivery") {
      checks.push({ id: "payment", group: G, title, rule: "Review #3", outcome: "review",
        message: `Balance is due ${v.days} days ${v.basis === "after_invoice" ? "after invoice" : "from an unclear reference point"}, not after delivery.`,
        expected: exp, actual: `${v.days} days (${v.basis})`, quote: q(f), page: pg(f), action: "Confirm when the payment clock starts." });
    } else {
      const bad = D(v.days).lt(RULES.paymentMinDays) || D(v.days).gt(RULES.paymentMaxDays);
      checks.push({ id: "payment", group: G, title, rule: "Review #3", outcome: bad ? "review" : "pass",
        message: bad ? `Balance due ${v.days} days after delivery, outside the ${exp} range.` : `Balance due ${v.days} days after delivery (within ${exp}).`,
        expected: exp, actual: `${v.days} days after delivery`, quote: q(f), page: pg(f),
        action: bad ? "Decide whether the payment terms are acceptable." : undefined });
    }
  }

  /* --- Validity (Review #7: < 30 days) --- */
  {
    const f = ex.validity;
    const v = usable(f);
    const title = "Quotation validity";
    let days: number | null = null;
    if (v) {
      if (v.days !== null) days = v.days;
      else if (v.untilDate) {
        const start = usable(ex.quotationDate);
        const a = start ? Date.parse(start) : NaN;
        const b = Date.parse(v.untilDate);
        if (!Number.isNaN(a) && !Number.isNaN(b)) days = Math.round((b - a) / 86_400_000);
      }
    }
    if (days === null) {
      checks.push({ id: "validity", group: G, title, rule: "Review #7", outcome: "review",
        message: "Quotation validity is missing or cannot be determined.", expected: `≥ ${RULES.validityMinDays} days`,
        actual: f.status, quote: q(f), page: pg(f), action: "Confirm how long the quotation is valid." });
    } else {
      const bad = days < RULES.validityMinDays;
      checks.push({ id: "validity", group: G, title, rule: "Review #7", outcome: bad ? "review" : "pass",
        message: bad ? `Quotation is valid for only ${days} days (minimum ${RULES.validityMinDays}).` : `Quotation is valid for ${days} days (minimum ${RULES.validityMinDays}).`,
        expected: `≥ ${RULES.validityMinDays} days`, actual: `${days} days`, quote: q(f), page: pg(f),
        action: bad ? "Ask for an extension or decide quickly." : undefined });
    }
  }

  /* --- VAT shown separately at 15% (Review #5) --- */
  {
    const p = ex.vatPercent;
    const a = ex.vatAmount;
    const pv = usable(p);
    const av = usable(a);
    const ok = pv !== undefined && av !== undefined && D(pv).eq(RULES.vatPct);
    checks.push({ id: "vat", group: G, title: "VAT shown separately at 15%", rule: "Review #5", outcome: ok ? "pass" : "review",
      message: ok ? "VAT is shown as a separate 15% line."
        : pv === undefined || av === undefined ? "VAT is not clearly shown as a separate line with a rate and amount."
        : `VAT is shown at ${pv}%, not ${RULES.vatPct}%.`,
      expected: `${RULES.vatPct}% shown separately`, actual: pv === undefined ? p.status : `${pv}%${av === undefined ? " (no amount)" : ""}`,
      quote: q(p) ?? q(a), page: pg(p) ?? pg(a), action: ok ? undefined : "Check how VAT is presented and whether the rate is correct." });
  }

  return checks;
}
