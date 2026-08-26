import { readFile } from "node:fs/promises";
import { inspectPharmacyFile } from "../client/src/lib/pharmacyEngine";
import { approveAllSuggestions } from "../client/src/lib/importReview";
import { analyzeInventoryOperations } from "../client/src/lib/inventoryEngine";
import { analyzeProductMovement } from "../client/src/lib/productMovementEngine";

const inputPath = process.argv[2] ?? "/home/ubuntu/upload/6-8.xlsx";
const bytes = await readFile(inputPath);
const inspection = approveAllSuggestions(await inspectPharmacyFile(new File([bytes], "6-8.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })));
const inventory = analyzeInventoryOperations(inspection.sheets);
const movement = analyzeProductMovement(inspection.sheets);
const zeroItems = inventory.items.filter((item) => item.stock === 0);

console.log(JSON.stringify({
  quality: inspection.sheets[0]?.quality,
  mappings: inspection.sheets[0]?.mappings.filter((mapping) => ["item_name", "item_code", "stock_quantity", "sales_total", "quantity_sold", "sale_price", "cost_price"].includes(mapping.field)),
  inventory: {
    available: inventory.available,
    note: inventory.note,
    items: inventory.items.length,
    zeroItems: zeroItems.length,
    zeroItemsWithTotalSales: zeroItems.filter((item) => item.sales !== undefined).length,
    zeroItemsTotalSales: zeroItems.reduce((total, item) => total + (item.sales ?? 0), 0),
    zeroItemsWithSalePrice: zeroItems.filter((item) => item.unitSalePrice !== undefined).length,
    zeroItemsWithCost: zeroItems.filter((item) => item.unitCost !== undefined).length,
    samples: zeroItems.slice(0, 25).map((item) => ({ code: item.itemCode, name: item.itemName, stock: item.stock, sales: item.sales, salePrice: item.unitSalePrice, cost: item.unitCost, quantity: item.salesQuantity, note: item.note })),
  },
  movement: movement.metrics,
}, null, 2));
