import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:3000/";
const sourceFile = "/home/ubuntu/upload/6-8.xlsx";

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, locale: "ar-EG" });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').first().setInputFiles(sourceFile);
  await page.getByText("المرحلة 2: تدقيق وتحرير مصدر القرار", { exact: true }).waitFor({ timeout: 20_000 });
  await page.getByRole("navigation", { name: "مسار التحليل" }).getByText("راجع الورقة وخريطة الحقول", { exact: true }).waitFor({ timeout: 20_000 });

  const editor = page.locator("#sheet-manual-editor");
  const header = editor.getByLabel("عنوان العمود A");
  const originalHeader = await header.inputValue();
  await header.fill("اسم اختبار الإدارة");
  await header.press("Tab");
  await page.getByRole("button", { name: "تراجع" }).click();
  await header.waitFor({ state: "visible" });
  if (await header.inputValue() !== originalHeader) throw new Error("لم يُستعد عنوان العمود الأصلي بعد التراجع.");
  await page.getByRole("button", { name: "إعادة" }).click();
  if (await header.inputValue() !== "اسم اختبار الإدارة") throw new Error("لم يُستعد عنوان العمود المعدّل بعد الإعادة.");

  const cell = editor.getByLabel("خلية A3");
  await cell.waitFor({ state: "visible", timeout: 20_000 });
  const cellLabel = await cell.getAttribute("aria-label");
  if (!cellLabel) throw new Error("تعذر تحديد الخلية المختارة للتحقق من التراجع.");
  const originalCell = await cell.inputValue();
  await cell.fill("999999");
  await cell.press("Tab");
  await page.getByRole("button", { name: "تراجع" }).click();
  await page.waitForFunction((input) => document.querySelector(input.selector)?.value === input.expected, { selector: `input[aria-label="${cellLabel}"]`, expected: originalCell }, { timeout: 2_000 });
  if (await cell.inputValue() !== originalCell) throw new Error("لم تُستعد قيمة الخلية الأصلية بعد التراجع.");
  await page.getByRole("button", { name: "إعادة" }).click();
  await page.waitForFunction((input) => document.querySelector(input.selector)?.value === input.expected, { selector: `input[aria-label="${cellLabel}"]`, expected: "999999" }, { timeout: 2_000 });
  if (await cell.inputValue() !== "999999") throw new Error("لم تُستعد قيمة الخلية المعدّلة بعد الإعادة.");

  const undoButton = page.getByRole("button", { name: "تراجع" });
  await editor.getByRole("button", { name: "إضافة صف محلي" }).click();
  const historyAfterAddingRow = Number(await undoButton.getAttribute("data-history-count"));
  const localRowCell = editor.locator('input[aria-label^="خلية A"]').last();
  await localRowCell.waitFor({ state: "visible" });
  const localRowCellLabel = await localRowCell.getAttribute("aria-label");
  if (!localRowCellLabel) throw new Error("تعذر تحديد خلية الصف المحلي الجديد.");
  await localRowCell.fill("ROW-LOCAL");
  await editor.getByText("إدارة الأعمدة المحلية").click();
  await page.waitForFunction((count) => Number(document.querySelector('button[data-history-count]')?.getAttribute("data-history-count")) > count, historyAfterAddingRow, { timeout: 2_000 });
  await undoButton.click();
  await page.waitForFunction((input) => document.querySelector(input.selector)?.value === "", { selector: `input[aria-label="${localRowCellLabel}"]` }, { timeout: 2_000 });
  await page.getByRole("button", { name: "إعادة" }).click();
  await page.waitForFunction((input) => document.querySelector(input.selector)?.value === "ROW-LOCAL", { selector: `input[aria-label="${localRowCellLabel}"]` }, { timeout: 2_000 });
  await editor.getByRole("button", { name: "حذف آخر صف محلي" }).click();

  await editor.getByRole("button", { name: "إضافة عمود محلي" }).click();
  const localHeader = editor.locator('input[aria-label^="عنوان العمود "]').last();
  await localHeader.waitFor({ state: "visible" });
  await localHeader.fill("تصنيف المدير");
  await localHeader.press("Tab");
  const localCell = editor.locator('input[aria-label^="خلية "]').last();
  await localCell.fill("حرج");
  await localCell.press("Tab");
  await editor.getByRole("button", { name: "استبعد أعمدة النطاق" }).click();
  const restoredColumn = editor.getByRole("button", { name: /العمود [A-Z]+ مستبعد/ }).first();
  await restoredColumn.waitFor({ state: "visible" });
  await restoredColumn.click();
  await editor.getByRole("button", { name: "حذف آخر عمود محلي" }).click();

  console.log("VERIFY_EDITABLE_SHEET_UNDO_OK");
} finally {
  await browser.close();
}
