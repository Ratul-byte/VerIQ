import type { Check, ComparisonRow, Extraction, PrLine } from "@/lib/types";
import { D, fmtMoney, fmtNum, fmtPct } from "@/lib/money";
import { RULES } from "./config";
import { norm, pg, q, usable } from "./util";

/** Node 4: purchase-request comparison. All arithmetic is deterministic (decimal.js). */
export function comparePurchaseRequest(
  ex: Extraction,
  prLines: PrLine[],
): { checks: Check[]; rows: ComparisonRow[]; prLine: PrLine | null } {
  const checks: Check[] = [];
  const rows: ComparisonRow[] = [];
  const G = "purchase_request" as const;

  /* --- PR reference --- */
  const prRef = usable(ex.prReference);
  const knownPr = prLines[0]?.prNumber ?? null;
  if (prRef === undefined) {
    checks.push({
      id: "pr_reference", group: G, title: "Purchase request reference", outcome: "review",
      message: "The quotation's purchase request reference is missing or unclear.",
      expected: knownPr ?? undefined, actual: "not found", quote: q(ex.prReference), page: pg(ex.prReference),
      action: "Confirm which purchase request this quotation answers.",
    });
  } else if (knownPr && norm(prRef) !== norm(knownPr)) {
    checks.push({
      id: "pr_reference", group: G, title: "Purchase request reference", outcome: "review",
      message: `Quotation refers to ${prRef}, but the purchase request on file is ${knownPr}.`,
      expected: knownPr, actual: prRef, quote: q(ex.prReference), page: pg(ex.prReference),
      action: "Check whether the supplier quoted against the wrong purchase request.",
    });
  } else {
    checks.push({
      id: "pr_reference", group: G, title: "Purchase request reference", outcome: "pass",
      message: "Reference matches the purchase request.", expected: knownPr ?? undefined, actual: prRef,
      quote: q(ex.prReference), page: pg(ex.prReference),
    });
  }

  /* --- Exactly one item per pack --- */
  if (ex.items.length !== 1) {
    checks.push({
      id: "item_count", group: G, title: "One item per supplier pack", outcome: "review",
      message: ex.items.length === 0
        ? "No quotation line items could be extracted."
        : `${ex.items.length} line items were found; each pack should cover exactly one item.`,
      expected: "1", actual: String(ex.items.length),
      action: "Open the document and confirm which line should be compared.",
    });
    return { checks, rows, prLine: null };
  }
  const item = ex.items[0];

  /* --- Item lookup --- */
  const itemId = usable(item.itemId);
  const prLine = itemId ? prLines.find((l) => norm(l.itemId) === norm(itemId)) ?? null : null;
  if (!prLine) {
    checks.push({
      id: "item_match", group: G, title: "Item exists in purchase request", outcome: "review",
      message: itemId
        ? `Item "${itemId}" is not in the purchase request.`
        : "The item identifier is missing or unclear, so the item cannot be matched.",
      expected: prLines.map((l) => l.itemId).join(", "), actual: itemId ?? "not found",
      quote: q(item.itemId), page: pg(item.itemId),
      action: "Identify the intended purchase request item manually.",
    });
    return { checks, rows, prLine: null };
  }
  checks.push({
    id: "item_match", group: G, title: "Item exists in purchase request", outcome: "pass",
    message: `Item ${prLine.itemId} found in ${prLine.prNumber}.`, expected: prLine.itemId, actual: itemId!,
    quote: q(item.itemId), page: pg(item.itemId),
  });

  /* --- Description --- */
  const desc = usable(item.description);
  const descOk = desc !== undefined && norm(desc) === norm(prLine.description);
  checks.push({
    id: "item_description", group: G, title: "Item description matches", outcome: descOk ? "pass" : "review",
    message: descOk ? "Description matches the purchase request."
      : desc === undefined ? "Item description is missing or unclear."
      : "Item description differs from the purchase request.",
    expected: prLine.description, actual: desc ?? "not found", quote: q(item.description), page: pg(item.description),
    action: descOk ? undefined : "Confirm the supplier is quoting the specified product (spec, size, grade).",
  });
  rows.push({
    label: "Description", requested: prLine.description, quoted: desc ?? "—",
    difference: descOk ? "match" : "differs", status: descOk ? "pass" : "review",
  });

  /* --- Unit --- */
  const unit = usable(item.unit);
  const unitOk = unit !== undefined && norm(unit) === norm(prLine.unit);
  checks.push({
    id: "item_unit", group: G, title: "Unit of measure matches", outcome: unitOk ? "pass" : "review",
    message: unitOk ? "Unit matches." : unit === undefined ? "Unit is missing or unclear." : "Unit differs from the purchase request.",
    expected: prLine.unit, actual: unit ?? "not found", quote: q(item.unit), page: pg(item.unit),
    action: unitOk ? undefined : "Confirm the unit of measure; prices may not be comparable.",
  });
  rows.push({
    label: "Unit", requested: prLine.unit, quoted: unit ?? "—",
    difference: unitOk ? "match" : "differs", status: unitOk ? "pass" : "review",
  });

  /* --- Quantity (Review if differs by MORE than 5%) --- */
  const qty = usable(item.quantity);
  if (qty === undefined) {
    checks.push({
      id: "quantity", group: G, title: "Quantity", rule: "Review #2", outcome: "review",
      message: "Quoted quantity is missing or unclear.", expected: fmtNum(prLine.quantity), actual: "not found",
      quote: q(item.quantity), page: pg(item.quantity), action: "Confirm the quoted quantity.",
    });
    rows.push({ label: "Quantity", requested: fmtNum(prLine.quantity), quoted: "—", difference: "unknown", status: "review" });
  } else {
    const diffPct = D(qty).minus(prLine.quantity).abs().div(prLine.quantity).times(100);
    const signed = D(qty).minus(prLine.quantity).div(prLine.quantity).times(100);
    const bad = diffPct.gt(RULES.quantityReviewAbovePct);
    checks.push({
      id: "quantity", group: G, title: "Quantity", rule: "Review #2", outcome: bad ? "review" : "pass",
      message: bad
        ? `Quoted quantity differs from the request by ${fmtPct(diffPct)} (limit ${RULES.quantityReviewAbovePct}%).`
        : `Quoted quantity is within ${RULES.quantityReviewAbovePct}% of the request (difference ${fmtPct(diffPct)}).`,
      expected: fmtNum(prLine.quantity), actual: fmtNum(qty), quote: q(item.quantity), page: pg(item.quantity),
      action: bad ? "Decide whether to accept the different quantity or ask the supplier to re-quote." : undefined,
    });
    rows.push({
      label: "Quantity", requested: fmtNum(prLine.quantity), quoted: fmtNum(qty),
      difference: fmtPct(signed, true), status: bad ? "review" : "pass",
    });
  }

  /* --- Unit price (Reject if > 3% above max; Review if above max by <= 3%) --- */
  const price = usable(item.unitPrice);
  if (price === undefined) {
    checks.push({
      id: "unit_price", group: G, title: "Unit price vs maximum", rule: "Reject #1 / Review #1", outcome: "review",
      message: "Quoted unit price is missing or unclear.", expected: `≤ ${fmtMoney(prLine.maxUnitPrice)}`, actual: "not found",
      quote: q(item.unitPrice), page: pg(item.unitPrice), action: "Confirm the quoted unit price.",
    });
    rows.push({ label: "Unit price (BDT)", requested: `max ${fmtMoney(prLine.maxUnitPrice)}`, quoted: "—", difference: "unknown", status: "review" });
  } else {
    const diffPct = D(price).minus(prLine.maxUnitPrice).div(prLine.maxUnitPrice).times(100);
    const reject = diffPct.gt(RULES.priceRejectAbovePct);
    const review = !reject && diffPct.gt(0);
    const outcome = reject ? "reject" : review ? "review" : "pass";
    checks.push({
      id: "unit_price", group: G, title: "Unit price vs maximum", rule: reject ? "Reject #1" : review ? "Review #1" : "Reject #1 / Review #1",
      outcome,
      message: reject
        ? `Unit price is ${fmtPct(diffPct)} above the maximum, more than the ${RULES.priceRejectAbovePct}% tolerance.`
        : review
          ? `Unit price is ${fmtPct(diffPct)} above the maximum (within the ${RULES.priceRejectAbovePct}% tolerance).`
          : `Unit price is at or below the maximum (${fmtPct(diffPct, true)}).`,
      expected: `≤ ${fmtMoney(prLine.maxUnitPrice)}`, actual: fmtMoney(price), quote: q(item.unitPrice), page: pg(item.unitPrice),
      action: review ? "Decide whether to accept a small overrun or negotiate the price." : undefined,
    });
    rows.push({
      label: "Unit price (BDT)", requested: `max ${fmtMoney(prLine.maxUnitPrice)}`, quoted: fmtMoney(price),
      difference: fmtPct(diffPct, true), status: outcome,
    });
  }

  return { checks, rows, prLine };
}
