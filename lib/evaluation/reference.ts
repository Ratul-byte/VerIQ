import type { Decision } from "@/lib/types";

export interface SupplierPackReference {
  file: string;
  quotationNumber: string;
  expected: Decision;
  reason: string;
  itemId: string;
  quantity?: number;
  unitPrice?: number;
  advancePercent?: number;
  paymentDays?: number;
  paymentBasis?: "after_delivery";
  deliveryDays?: number;
  penaltyPercentPerWeek?: number;
  tinPresent?: boolean;
  binPresent?: boolean;
}

/**
 * Structured form of supplier_pack.md. Evaluation uses this reference only;
 * it never sends the document or a verification result to a model.
 */
export const SUPPLIER_PACKS: SupplierPackReference[] = [
  {
    file: "supplier-pack-01.pdf", quotationNumber: "QT-2026-901", expected: "APPROVE",
    reason: "Item A complies with every rejection and human-verification rule.",
    itemId: "A", quantity: 12000, unitPrice: 472, advancePercent: 10, paymentDays: 45,
    paymentBasis: "after_delivery", deliveryDays: 24, penaltyPercentPerWeek: 1,
    tinPresent: true, binPresent: true,
  },
  {
    file: "supplier-pack-02.pdf", quotationNumber: "QT-2026-902", expected: "APPROVE",
    reason: "Item B complies with every rejection and human-verification rule.",
    itemId: "B", quantity: 20000, unitPrice: 36, advancePercent: 0, paymentDays: 30,
    paymentBasis: "after_delivery", deliveryDays: 21, penaltyPercentPerWeek: 0.75,
    tinPresent: true, binPresent: true,
  },
  {
    file: "supplier-pack-03.pdf", quotationNumber: "QT-2026-903", expected: "REJECT",
    reason: "Item C price is more than 3% above the purchase-request maximum.",
    itemId: "C", unitPrice: 229,
  },
  {
    file: "supplier-pack-04.pdf", quotationNumber: "QT-2026-904", expected: "NEEDS_REVIEW",
    reason: "Item D price is above the maximum, but within the 3% tolerance.",
    itemId: "D", unitPrice: 6.65,
  },
  {
    file: "supplier-pack-05.pdf", quotationNumber: "QT-2026-905", expected: "REJECT",
    reason: "Advance payment is 40%, above the 20% limit.",
    itemId: "E", advancePercent: 40,
  },
  {
    file: "supplier-pack-06.pdf", quotationNumber: "QT-2026-906", expected: "REJECT",
    reason: "The contract has no late-delivery penalty clause.",
    itemId: "A", penaltyPercentPerWeek: 0,
  },
  {
    file: "supplier-pack-08.pdf", quotationNumber: "QT-2026-08", expected: "REJECT",
    reason: "The supplier TIN or BIN is missing.",
    itemId: "C", tinPresent: false, binPresent: false,
  },
  {
    file: "supplier-pack-09.pdf", quotationNumber: "QT-2026-909", expected: "NEEDS_REVIEW",
    reason: "Payment terms are unclear or outside 30 to 60 days after delivery.",
    itemId: "D",
  },
  {
    file: "supplier-pack-10.pdf", quotationNumber: "QT-2026-910", expected: "REJECT",
    reason: "Delivery is promised later than 45 days after the purchase order.",
    itemId: "E", deliveryDays: 60,
  },
  {
    file: "supplier-pack-07.pdf", quotationNumber: "QT-2026-907", expected: "NEEDS_REVIEW",
    reason: "Quoted quantity differs from the requested quantity by more than 5%.",
    itemId: "B", quantity: 16500,
  },
];
