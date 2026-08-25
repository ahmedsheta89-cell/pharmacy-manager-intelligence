import type { InventoryItem } from "./inventoryEngine";

export type StockFilter = "all" | "zero" | "positive" | "unknown";
export type ExplorerSort = "name" | "stock" | "salePrice" | "cost" | "margin" | "salesQuantity" | "stockValue" | "priority";

export type ProductExplorerFilters = {
  query: string;
  stock: StockFilter;
  minSalePrice?: number;
  maxSalePrice?: number;
  minCost?: number;
  maxCost?: number;
  minMargin?: number;
  minSalesQuantity?: number;
  sort: ExplorerSort;
  descending: boolean;
};

export const defaultProductExplorerFilters: ProductExplorerFilters = {
  query: "",
  stock: "all",
  sort: "priority",
  descending: true,
};

function searchText(item: InventoryItem) {
  return [item.itemName, item.itemCode, item.company].filter(Boolean).join(" ").toLocaleLowerCase("ar-EG");
}

function sortValue(item: InventoryItem, sort: ExplorerSort) {
  if (sort === "name") return item.itemName.toLocaleLowerCase("ar-EG");
  if (sort === "stock") return item.stock;
  if (sort === "salePrice") return item.unitSalePrice;
  if (sort === "cost") return item.unitCost;
  if (sort === "margin") return item.profitMargin;
  if (sort === "salesQuantity") return item.salesQuantity;
  if (sort === "stockValue") return item.stockSaleValue;
  return item.stock === 0 ? Number.MAX_SAFE_INTEGER : item.salesQuantity;
}

export function filterAndSortProducts(items: InventoryItem[], filters: ProductExplorerFilters): InventoryItem[] {
  const query = filters.query.trim().toLocaleLowerCase("ar-EG");
  const result = items.filter((item) => {
    if (query && !searchText(item).includes(query)) return false;
    if (filters.stock === "zero" && item.stock !== 0) return false;
    if (filters.stock === "positive" && !(item.stock !== undefined && item.stock > 0)) return false;
    if (filters.stock === "unknown" && item.stock !== undefined) return false;
    if (filters.minSalePrice !== undefined && (item.unitSalePrice === undefined || item.unitSalePrice < filters.minSalePrice)) return false;
    if (filters.maxSalePrice !== undefined && (item.unitSalePrice === undefined || item.unitSalePrice > filters.maxSalePrice)) return false;
    if (filters.minCost !== undefined && (item.unitCost === undefined || item.unitCost < filters.minCost)) return false;
    if (filters.maxCost !== undefined && (item.unitCost === undefined || item.unitCost > filters.maxCost)) return false;
    if (filters.minMargin !== undefined && (item.profitMargin === undefined || item.profitMargin < filters.minMargin)) return false;
    if (filters.minSalesQuantity !== undefined && (item.salesQuantity === undefined || item.salesQuantity < filters.minSalesQuantity)) return false;
    return true;
  });

  return [...result].sort((left, right) => {
    const a = sortValue(left, filters.sort);
    const b = sortValue(right, filters.sort);
    if (typeof a === "string" && typeof b === "string") return filters.descending ? b.localeCompare(a, "ar") : a.localeCompare(b, "ar");
    const aNumber = typeof a === "number" ? a : -Infinity;
    const bNumber = typeof b === "number" ? b : -Infinity;
    return filters.descending ? bNumber - aNumber : aNumber - bNumber;
  });
}
