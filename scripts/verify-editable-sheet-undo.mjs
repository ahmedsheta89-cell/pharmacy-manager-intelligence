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
  await editor.getByTestId("column-arrangement-screen").waitFor({ timeout: 20_000 });

  const columnA = editor.getByTestId("column-choice-0");
  const columnB = editor.getByTestId("column-choice-1");
  const initialTitleA = await columnA.locator("span").nth(1).innerText();
  const initialTitleB = await columnB.locator("span").nth(1).innerText();
  await columnB.click();
  await editor.getByRole("button", { name: "حرّك الاسم يمينًا" }).click();
  if (await columnA.locator("span").nth(1).innerText() !== initialTitleB) throw new Error("لم ينقل سهم اليمين اسم العمود إلى موضعه المرئي الجديد.");
  await editor.getByRole("button", { name: "تراجع آخر قرار" }).click();
  if (await columnA.locator("span").nth(1).innerText() !== initialTitleA) throw new Error("لم يُستعد ترتيب أسماء الأعمدة بعد التراجع.");

  await editor.getByRole("tab", { name: "2. عدّل البيانات" }).click();
  const header = editor.getByLabel("عنوان العمود A");
  await header.waitFor({ state: "visible" });
  const originalHeader = await header.inputValue();
  await header.fill("اسم اختبار الإدارة");
  await header.press("Tab");
  await editor.getByRole("tab", { name: "3. راجع الصفوف" }).click();
  await editor.getByRole("button", { name: "تراجع" }).click();
  await editor.getByRole("tab", { name: "2. عدّل البيانات" }).click();
  await header.waitFor({ state: "visible" });
  if (await header.inputValue() !== originalHeader) throw new Error("لم يُستعد عنوان العمود الأصلي بعد التراجع.");
  await editor.getByRole("tab", { name: "3. راجع الصفوف" }).click();
  await editor.getByRole("button", { name: "إعادة" }).click();
  await editor.getByRole("tab", { name: "2. عدّل البيانات" }).click();
  if (await header.inputValue() !== "اسم اختبار الإدارة") throw new Error("لم يُستعد عنوان العمود المعدّل بعد الإعادة.");

  const cell = editor.getByLabel("خلية A3");
  await cell.waitFor({ state: "visible", timeout: 20_000 });
  const cellLabel = await cell.getAttribute("aria-label");
  if (!cellLabel) throw new Error("تعذر تحديد الخلية المختارة للتحقق من التراجع.");
  const originalCell = await cell.inputValue();
  await cell.fill("999999");
  await cell.press("Tab");
  await editor.getByRole("tab", { name: "3. راجع الصفوف" }).click();
  await editor.getByRole("button", { name: "تراجع" }).click();
  await editor.getByRole("tab", { name: "2. عدّل البيانات" }).click();
  await page.waitForFunction((input) => document.querySelector(input.selector)?.value === input.expected, { selector: `input[aria-label="${cellLabel}"]`, expected: originalCell }, { timeout: 2_000 });
  await editor.getByRole("tab", { name: "3. راجع الصفوف" }).click();
  await editor.getByRole("button", { name: "إعادة" }).click();
  await editor.getByRole("tab", { name: "2. عدّل البيانات" }).click();
  await page.waitForFunction((input) => document.querySelector(input.selector)?.value === input.expected, { selector: `input[aria-label="${cellLabel}"]`, expected: "999999" }, { timeout: 2_000 });

  await editor.getByRole("tab", { name: "3. راجع الصفوف" }).click();
  const undoButton = editor.getByRole("button", { name: "تراجع" });
  await editor.getByRole("button", { name: "إضافة صف محلي" }).click();
  const historyAfterAddingRow = Number(await undoButton.getAttribute("data-history-count"));
  await editor.getByRole("tab", { name: "2. عدّل البيانات" }).click();
  const localRowCell = editor.locator('input[aria-label^="خلية A"]').last();
  await localRowCell.waitFor({ state: "visible" });
  const localRowCellLabel = await localRowCell.getAttribute("aria-label");
  if (!localRowCellLabel) throw new Error("تعذر تحديد خلية الصف المحلي الجديد.");
  await localRowCell.fill("ROW-LOCAL");
  await editor.getByRole("tab", { name: "3. راجع الصفوف" }).click();
  await page.waitForFunction((count) => Number(document.querySelector('button[data-history-count]')?.getAttribute("data-history-count")) > count, historyAfterAddingRow, { timeout: 2_000 });
  await undoButton.click();
  await editor.getByRole("tab", { name: "2. عدّل البيانات" }).click();
  await page.waitForFunction((input) => document.querySelector(input.selector)?.value === "", { selector: `input[aria-label="${localRowCellLabel}"]` }, { timeout: 2_000 });
  await editor.getByRole("tab", { name: "3. راجع الصفوف" }).click();
  await editor.getByRole("button", { name: "إعادة" }).click();
  await editor.getByRole("tab", { name: "2. عدّل البيانات" }).click();
  await page.waitForFunction((input) => document.querySelector(input.selector)?.value === "ROW-LOCAL", { selector: `input[aria-label="${localRowCellLabel}"]` }, { timeout: 2_000 });
  await editor.getByRole("tab", { name: "3. راجع الصفوف" }).click();
  await editor.getByRole("button", { name: "حذف آخر صف محلي" }).click();

  await editor.getByRole("tab", { name: "1. رتّب الأعمدة" }).click();
  await editor.getByRole("button", { name: "إضافة عمود يدوي" }).click();
  await editor.getByRole("tab", { name: "2. عدّل البيانات" }).click();
  const localHeader = editor.locator('input[aria-label^="عنوان العمود "]').last();
  await localHeader.waitFor({ state: "visible" });
  await localHeader.fill("تصنيف المدير");
  await localHeader.press("Tab");
  const localCell = editor.locator('input[aria-label^="خلية "]').last();
  await localCell.fill("حرج");
  await localCell.press("Tab");
  await editor.getByRole("tab", { name: "1. رتّب الأعمدة" }).click();
  await editor.getByTestId("column-choice-0").click();
  await editor.getByRole("button", { name: "استبعاد العمود" }).click();
  await editor.getByRole("button", { name: "استعادة العمود" }).click();
  await editor.getByRole("button", { name: "حذف آخر عمود يدوي" }).click();

  console.log("VERIFY_EDITABLE_SHEET_UNDO_OK");
} finally {
  await browser.close();
}
