import { describe, expect, it } from "vitest";
import { cleanExtraction, evaluate, missing, ok, unclear, withQtyPrice } from "./helpers";
import { decide } from "@/lib/rules/decision";

describe("compliant document", () => {
  it("approves a fully compliant quotation", () => {
    const r = evaluate(cleanExtraction());
    expect(r.decision).toBe("APPROVE");
    expect(r.triggered).toHaveLength(0);
  });
});

describe("TIN / BIN (Reject #4)", () => {
  it("rejects when TIN is missing", () => {
    const ex = cleanExtraction(); ex.supplierTin = missing();
    const r = evaluate(ex);
    expect(r.decision).toBe("REJECT");
    expect(r.byId("tin").outcome).toBe("reject");
  });
  it("rejects when BIN is missing", () => {
    const ex = cleanExtraction(); ex.supplierBin = missing();
    expect(evaluate(ex).byId("bin").outcome).toBe("reject");
    expect(evaluate(ex).decision).toBe("REJECT");
  });
  it("sends an unclear TIN to a person instead of rejecting", () => {
    const ex = cleanExtraction(); ex.supplierTin = unclear();
    expect(evaluate(ex).decision).toBe("NEEDS_REVIEW");
  });
});

describe("unit price (Reject #1 / Review #1) with boundaries", () => {
  it("passes at exactly the maximum", () => {
    expect(evaluate(withQtyPrice(cleanExtraction(), 12000, 480)).byId("unit_price").outcome).toBe("pass");
  });
  it("needs review when above the maximum but within 3%", () => {
    const r = evaluate(withQtyPrice(cleanExtraction(), 12000, 485));
    expect(r.byId("unit_price").outcome).toBe("review");
    expect(r.decision).toBe("NEEDS_REVIEW");
  });
  it("needs review at EXACTLY 3% above maximum (494.40)", () => {
    expect(evaluate(withQtyPrice(cleanExtraction(), 12000, 494.4)).byId("unit_price").outcome).toBe("review");
  });
  it("rejects above 3% (494.41)", () => {
    const r = evaluate(withQtyPrice(cleanExtraction(), 12000, 494.41));
    expect(r.byId("unit_price").outcome).toBe("reject");
    expect(r.decision).toBe("REJECT");
  });
});

describe("quantity (Review #2) with boundaries", () => {
  it("passes at exactly 5% difference (12,600)", () => {
    expect(evaluate(withQtyPrice(cleanExtraction(), 12600, 472)).byId("quantity").outcome).toBe("pass");
  });
  it("passes at exactly -5% (11,400)", () => {
    expect(evaluate(withQtyPrice(cleanExtraction(), 11400, 472)).byId("quantity").outcome).toBe("pass");
  });
  it("needs review just over 5% (12,601)", () => {
    expect(evaluate(withQtyPrice(cleanExtraction(), 12601, 472)).byId("quantity").outcome).toBe("review");
  });
  it("flags +8.33% for 13,000 vs 12,000", () => {
    const c = evaluate(withQtyPrice(cleanExtraction(), 13000, 472)).byId("quantity");
    expect(c.outcome).toBe("review");
    expect(c.message).toContain("8.33%");
  });
});

describe("advance payment (Reject #2) with boundaries", () => {
  it.each([[20, "pass"], [20.01, "reject"], [30, "reject"], [0, "pass"]])("advance %s%% -> %s", (v, out) => {
    const ex = cleanExtraction(); ex.advancePercent = ok(v);
    expect(evaluate(ex).byId("advance").outcome).toBe(out);
  });
  it("does not assume 0% when the advance term is missing", () => {
    const ex = cleanExtraction(); ex.advancePercent = missing();
    expect(evaluate(ex).byId("advance").outcome).toBe("review");
  });
});

describe("late-delivery penalty (Reject #3 + 0.5%/week minimum)", () => {
  it("rejects when there is no penalty clause", () => {
    const ex = cleanExtraction(); ex.penalty = missing();
    const r = evaluate(ex);
    expect(r.byId("penalty").outcome).toBe("reject");
    expect(r.decision).toBe("REJECT");
  });
  it("rejects an explicit 0% penalty", () => {
    const ex = cleanExtraction(); ex.penalty = ok({ percent: 0, period: "week", basis: "order_value" });
    expect(evaluate(ex).byId("penalty").outcome).toBe("reject");
  });
  it("needs review below 0.5% per week", () => {
    const ex = cleanExtraction(); ex.penalty = ok({ percent: 0.4, period: "week", basis: "order_value" });
    const r = evaluate(ex);
    expect(r.byId("penalty").outcome).toBe("review");
    expect(r.decision).toBe("NEEDS_REVIEW");
  });
  it("passes at exactly 0.5% per week", () => {
    const ex = cleanExtraction(); ex.penalty = ok({ percent: 0.5, period: "week", basis: "order_value" });
    expect(evaluate(ex).byId("penalty").outcome).toBe("pass");
  });
  it("converts a per-day penalty to a weekly rate", () => {
    const ex = cleanExtraction(); ex.penalty = ok({ percent: 0.1, period: "day", basis: "order_value" });
    expect(evaluate(ex).byId("penalty").outcome).toBe("pass"); // 0.7% / week
  });
  it("sends a penalty not based on order value to a person", () => {
    const ex = cleanExtraction(); ex.penalty = ok({ percent: 1, period: "week", basis: "other" });
    expect(evaluate(ex).byId("penalty").outcome).toBe("review");
  });
});

describe("delivery (Reject #5 / Review #4) with boundaries", () => {
  it.each([
    [30, "days", "pass"], [31, "days", "review"], [45, "days", "review"], [46, "days", "reject"],
    [4, "weeks", "pass"], [6, "weeks", "review"], [7, "weeks", "reject"],
  ] as const)("%s %s -> %s", (value, unit, out) => {
    const ex = cleanExtraction(); ex.delivery = ok({ value, unit, from: "purchase_order" });
    expect(evaluate(ex).byId("delivery").outcome).toBe(out);
  });
  it("does not guess when delivery is in working days or months", () => {
    const ex = cleanExtraction(); ex.delivery = ok({ value: 30, unit: "working_days", from: "purchase_order" });
    expect(evaluate(ex).byId("delivery").outcome).toBe("review");
  });
});

describe("payment terms (Review #3) with boundaries", () => {
  it.each([[29, "review"], [30, "pass"], [60, "pass"], [61, "review"]])("balance %s days after delivery -> %s", (days, out) => {
    const ex = cleanExtraction(); ex.balancePayment = ok({ days, basis: "after_delivery" });
    expect(evaluate(ex).byId("payment").outcome).toBe(out);
  });
  it("flags ambiguous payment terms", () => {
    const ex = cleanExtraction(); ex.balancePayment = unclear();
    expect(evaluate(ex).byId("payment").outcome).toBe("review");
  });
  it("flags payment counted from the invoice rather than delivery", () => {
    const ex = cleanExtraction(); ex.balancePayment = ok({ days: 45, basis: "after_invoice" });
    expect(evaluate(ex).byId("payment").outcome).toBe("review");
  });
});

describe("quotation validity (Review #7) with boundaries", () => {
  it.each([[29, "review"], [30, "pass"]])("validity %s days -> %s", (days, out) => {
    const ex = cleanExtraction(); ex.validity = ok({ days, untilDate: null });
    expect(evaluate(ex).byId("validity").outcome).toBe(out);
  });
  it("needs review when validity is missing", () => {
    const ex = cleanExtraction(); ex.validity = missing();
    expect(evaluate(ex).byId("validity").outcome).toBe("review");
  });
  it("computes validity from an expiry date", () => {
    const ex = cleanExtraction(); ex.validity = ok({ days: null, untilDate: "2026-11-10" }); // 20 days after 2026-10-21
    expect(evaluate(ex).byId("validity").outcome).toBe("review");
  });
});

describe("VAT (Review #5)", () => {
  it("flags a VAT rate other than 15%", () => {
    const ex = cleanExtraction(); ex.vatPercent = ok(10);
    expect(evaluate(ex).byId("vat").outcome).toBe("review");
  });
  it("flags VAT that is not shown separately", () => {
    const ex = cleanExtraction(); ex.vatAmount = missing(); ex.vatPercent = missing();
    expect(evaluate(ex).byId("vat").outcome).toBe("review");
  });
});

describe("financial verification (Review #6)", () => {
  it("flags an incorrect line total", () => {
    const ex = cleanExtraction(); ex.items[0].lineTotal = ok(5_664_100);
    expect(evaluate(ex).byId("line_total_0").outcome).toBe("review");
  });
  it("flags an incorrect subtotal", () => {
    const ex = cleanExtraction(); ex.subtotal = ok(5_000_000);
    expect(evaluate(ex).byId("subtotal").outcome).toBe("review");
  });
  it("flags an incorrect VAT amount", () => {
    const ex = cleanExtraction(); ex.vatAmount = ok(800_000);
    expect(evaluate(ex).byId("vat_amount").outcome).toBe("review");
  });
  it("flags an incorrect grand total", () => {
    const ex = cleanExtraction(); ex.grandTotal = ok(6_000_000);
    const r = evaluate(ex);
    expect(r.byId("grand_total").outcome).toBe("review");
    expect(r.decision).toBe("NEEDS_REVIEW");
  });
  it("tolerates a one-paisa rounding difference only", () => {
    const a = cleanExtraction(); a.grandTotal = ok(6_513_600.01);
    expect(evaluate(a).byId("grand_total").outcome).toBe("pass");
    const b = cleanExtraction(); b.grandTotal = ok(6_513_600.02);
    expect(evaluate(b).byId("grand_total").outcome).toBe("review");
  });
  it("cannot verify when the subtotal is missing", () => {
    const ex = cleanExtraction(); ex.subtotal = missing();
    expect(evaluate(ex).decision).toBe("NEEDS_REVIEW");
  });
});

describe("purchase request matching", () => {
  it("flags a different purchase request reference", () => {
    const ex = cleanExtraction(); ex.prReference = ok("PR-2026-999");
    expect(evaluate(ex).byId("pr_reference").outcome).toBe("review");
  });
  it("flags an item that is not in the purchase request", () => {
    const ex = cleanExtraction(); ex.items[0].itemId = ok("Z");
    const r = evaluate(ex);
    expect(r.byId("item_match").outcome).toBe("review");
    expect(r.decision).toBe("NEEDS_REVIEW");
  });
  it("flags a different item description", () => {
    const ex = cleanExtraction(); ex.items[0].description = ok("Cotton twill fabric, 320 gsm");
    expect(evaluate(ex).byId("item_description").outcome).toBe("review");
  });
  it("flags a different unit", () => {
    const ex = cleanExtraction(); ex.items[0].unit = ok("yard");
    expect(evaluate(ex).byId("item_unit").outcome).toBe("review");
  });
  it("sends multi-item packs to a person", () => {
    const ex = cleanExtraction(); ex.items.push(structuredClone(ex.items[0]));
    expect(evaluate(ex).byId("item_count").outcome).toBe("review");
  });
});

describe("precedence and combinations", () => {
  it("REJECT beats NEEDS_REVIEW when several rules fire", () => {
    const ex = withQtyPrice(cleanExtraction(), 13000, 510); // +6.25% price (reject), +8.33% qty (review)
    ex.advancePercent = ok(30); // reject
    ex.delivery = ok({ value: 40, unit: "days", from: "purchase_order" }); // review
    const r = evaluate(ex);
    expect(r.decision).toBe("REJECT");
    expect(r.triggered.filter((c) => c.outcome === "reject").map((c) => c.id).sort()).toEqual(["advance", "unit_price"]);
    expect(r.triggered.filter((c) => c.outcome === "review").map((c) => c.id)).toEqual(expect.arrayContaining(["quantity", "delivery"]));
  });
  it("NEEDS_REVIEW beats APPROVE", () => {
    const ex = cleanExtraction(); ex.validity = ok({ days: 10, untilDate: null });
    expect(evaluate(ex).decision).toBe("NEEDS_REVIEW");
  });
  it("never approves when a processing error exists", () => {
    expect(evaluate(cleanExtraction(), "LLM failed").decision).toBe("NEEDS_REVIEW");
  });
  it("never approves when required checks did not run", () => {
    const r = decide([], null);
    expect(r.decision).toBe("NEEDS_REVIEW");
  });
});
