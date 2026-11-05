import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const D = (v: Decimal.Value) => new Decimal(v);

/** Currency precision: BDT is compared to the paisa; one paisa of rounding slack is allowed. */
export const MONEY_TOLERANCE = new Decimal("0.01");

export const moneyEq = (a: Decimal.Value, b: Decimal.Value) =>
  D(a).minus(D(b)).abs().lte(MONEY_TOLERANCE);

export const fmtMoney = (v: Decimal.Value) =>
  D(v)
    .toDecimalPlaces(2)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const fmtNum = (v: Decimal.Value) =>
  D(v).toDecimalPlaces(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const fmtPct = (v: Decimal.Value, signed = false) => {
  const d = D(v).toDecimalPlaces(2);
  return `${signed && d.gt(0) ? "+" : ""}${d.toString()}%`;
};
