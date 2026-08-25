import { describe, expect, it } from "vitest";
import { analyzeInventoryOperations } from "./inventoryEngine";
import type { SheetInspection } from "./pharmacyEngine";

const sheet = {
  name: "مخزون",
  quality: { recognizedFields: ["item_name", "item_code", "stock_quantity", "sale_price", "cost_price", "quantity_sold"] },
  mappings: [
    { sourceColumn: "الاسم", field: "item_name", approvalStatus: "approved" },
    { sourceColumn: "الكود", field: "item_code", approvalStatus: "approved" },
    { sourceColumn: "الرصيد", field: "stock_quantity", approvalStatus: "approved" },
    { sourceColumn: "سعر البيع", field: "sale_price", approvalStatus: "approved" },
    { sourceColumn: "سعر الشراء", field: "cost_price", approvalStatus: "approved" },
    { sourceColumn: "الصرف", field: "quantity_sold", approvalStatus: "approved" },
  ],
  cleanRecords: [
    { "الاسم": "صنف رصيده صفر", "الكود": "Z-1", "الرصيد": 0, "سعر البيع": 100, "سعر الشراء": 65, "الصرف": 12, __metrics: { unitSalePrice: 100, unitCost: 65, quantity: 12 }, __rowIndex: 2, __sheetName: "مخزون" },
    { "الاسم": "صنف بلا تكلفة", "الكود": "N-1", "الرصيد": 3, "سعر البيع": 50, "الصرف": 2, __metrics: { unitSalePrice: 50, quantity: 2 }, __rowIndex: 3, __sheetName: "مخزون" },
  ],
} as unknown as SheetInspection;

describe("تحليل قيم المخزون", () => {
  it("يحافظ على الصنف الصفري ويحسب قيمته بصفر مع إظهار أسعار الوحدة", () => {
    const item = analyzeInventoryOperations([sheet]).items.find((entry) => entry.itemCode === "Z-1");
    expect(item).toMatchObject({ stock: 0, unitSalePrice: 100, unitCost: 65, stockSaleValue: 0, stockCostValue: 0, stockProfitValue: 0, salesQuantity: 12 });
  });

  it("لا يخترع تكلفة أو قيمة تكلفة لصنف لا يحتوي سعر شراء", () => {
    const item = analyzeInventoryOperations([sheet]).items.find((entry) => entry.itemCode === "N-1");
    expect(item?.unitCost).toBeUndefined();
    expect(item?.stockCostValue).toBeUndefined();
    expect(item?.stockProfitValue).toBeUndefined();
  });
});
