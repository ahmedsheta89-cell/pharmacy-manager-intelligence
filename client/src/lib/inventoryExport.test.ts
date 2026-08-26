import { describe, expect, it } from "vitest";
import { buildProductExplorerWorkbook } from "./inventoryExport";
import { defaultProductExplorerFilters } from "./productExplorer";
import type { InventoryItem } from "./inventoryEngine";

const rows = [{
  id: "Z-1", itemName: "صنف رصيده صفر", itemCode: "Z-1", company: "شركة", stock: 0,
  unitSalePrice: 100, sales: 200, salesQuantity: 2, status: "low_stock", note: "رصيد صفري",
}] as InventoryItem[];

describe("تصدير مستكشف الأصناف", () => {
  it("يحفظ القيم غير المتاحة كنص واضح ولا يحولها إلى صفر", () => {
    const workbook = buildProductExplorerWorkbook(rows, { ...defaultProductExplorerFilters, stock: "zero" });
    expect(workbook.SheetNames).toEqual(["نتائج المستكشف", "الفلاتر المطبقة"]);
    expect(workbook.Sheets["نتائج المستكشف"]?.["F2"]?.v).toBe("غير متاح");
    expect(workbook.Sheets["الفلاتر المطبقة"]?.["B3"]?.v).toBe("zero");
  });
});
