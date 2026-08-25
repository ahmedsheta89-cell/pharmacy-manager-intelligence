import { describe, expect, it } from "vitest";
import { defaultProductExplorerFilters, filterAndSortProducts } from "./productExplorer";
import type { InventoryItem } from "./inventoryEngine";

const items: InventoryItem[] = [
  { id: "a", itemName: "صنف صفر", stock: 0, unitSalePrice: 100, unitCost: 60, stockSaleValue: 0, stockCostValue: 0, stockProfitValue: 0, salesQuantity: 10, status: "healthy", note: "" },
  { id: "b", itemName: "صنف حركة", stock: 4, unitSalePrice: 200, unitCost: 90, stockSaleValue: 800, stockCostValue: 360, stockProfitValue: 440, profitMargin: 55, salesQuantity: 70, status: "healthy", note: "" },
  { id: "c", itemName: "صنف بلا تكلفة", stock: 2, unitSalePrice: 300, status: "review", note: "" },
];

describe("مستكشف الأصناف", () => {
  it("يعرض كل الأصناف الصفرية حتى عندما تكون قيمة مخزونها صفرًا", () => {
    expect(filterAndSortProducts(items, { ...defaultProductExplorerFilters, stock: "zero" }).map((item) => item.id)).toEqual(["a"]);
  });

  it("لا يمرر صنفًا بلا تكلفة خلال فلتر التكلفة أو الربحية", () => {
    expect(filterAndSortProducts(items, { ...defaultProductExplorerFilters, minCost: 1 }).map((item) => item.id)).toEqual(["a", "b"]);
    expect(filterAndSortProducts(items, { ...defaultProductExplorerFilters, minMargin: 1 }).map((item) => item.id)).toEqual(["b"]);
  });

  it("يفرز حسب حركة الصرف من دون حد لعدد النتائج", () => {
    expect(filterAndSortProducts(items, { ...defaultProductExplorerFilters, sort: "salesQuantity", descending: true }).map((item) => item.id)).toEqual(["b", "a", "c"]);
  });
});
