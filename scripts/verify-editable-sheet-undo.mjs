import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:3000/";
const sourceFile = "/home/ubuntu/upload/6-8.xlsx";

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, locale: "ar-EG" });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').first().setInputFiles(sourceFile);
  await page.getByRole("heading", { name: "مراجعة الاستيراد" }).waitFor({ timeout: 20_000 });

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

  console.log("VERIFY_EDITABLE_SHEET_UNDO_OK");
} finally {
  await browser.close();
}
