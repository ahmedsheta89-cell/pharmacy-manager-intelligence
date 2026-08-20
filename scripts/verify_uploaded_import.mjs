import { readFile } from "node:fs/promises";
import { inspectPharmacyFile } from "../client/src/lib/pharmacyEngine.ts";
import { analyzeProductMovement } from "../client/src/lib/productMovementEngine.ts";

const sourcePath = "/home/ubuntu/upload/6-8.xlsx";
const data = await readFile(sourcePath);
const start = data.byteOffset;
const end = start + data.byteLength;

const localFile = {
  name: "6-8.xlsx",
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  size: data.byteLength,
  async arrayBuffer() {
    return data.buffer.slice(start, end);
  },
};

const inspection = await inspectPharmacyFile(localFile);
const movement = analyzeProductMovement(inspection.sheets);

console.log(JSON.stringify({
  sheets: inspection.sheets.map((sheet) => ({
    name: sheet.name,
    records: sheet.cleanRecords.length,
    headers: sheet.headers,
    mappings: sheet.mappings.map((mapping) => ({ source: mapping.sourceColumn, field: mapping.field, confidence: mapping.confidence })),
  })),
  zeroBalanceCount: movement.metrics.zeroBalanceCount,
  zeroBalanceSales: movement.zeroBalance.reduce((sum, item) => sum + (item.sales ?? 0), 0),
  zeroBalanceQuantity: movement.zeroBalance.reduce((sum, item) => sum + (item.quantity ?? 0), 0),
  dataGaps: movement.dataGaps,
}, null, 2));
