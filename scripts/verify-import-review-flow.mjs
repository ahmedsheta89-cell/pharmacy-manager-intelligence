import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import * as XLSX from "xlsx";

const projectRoot = "/home/ubuntu/pharmacy-manager-intelligence";
const sourceFile = "/home/ubuntu/upload/6-8.xlsx";
const changedFile = path.join(projectRoot, "scripts", "6-8-column-order-changed.xlsx");
const outputDirectory = path.join(projectRoot, "scripts", "verification-output");
const baseUrl = "http://127.0.0.1:3000/";

function swapHeaderValues(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const cells = [];
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = sheet[address];
      if (cell?.v === "إجمالى س.بيع" || cell?.v === "الرصيد") cells.push({ address, value: cell.v });
    }
  }
  if (cells.length !== 2) throw new Error("لم تُعثر على عنواني إجمالى س.بيع والرصيد لتوليد ملف الاختبار المختلف.");
  sheet[cells[0].address].v = cells[1].value;
  sheet[cells[1].address].v = cells[0].value;
}

const sourceBytes = await readFile(sourceFile);
const changedWorkbook = XLSX.read(sourceBytes, { type: "buffer" });
swapHeaderValues(changedWorkbook);
await writeFile(changedFile, XLSX.write(changedWorkbook, { bookType: "xlsx", type: "buffer" }));
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, locale: "ar-EG" });
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').first().setInputFiles(sourceFile);
  await page.getByRole("heading", { name: "مراجعة الاستيراد" }).waitFor({ timeout: 20_000 });

  await page.getByRole("heading", { name: "مقارنة مرئية للصفوف — المصدر مقابل الخريطة المصححة" }).waitFor();
  await page.getByRole("heading", { name: "قوالب خريطة الأعمدة المحلية" }).waitFor();
  await page.getByLabel("أؤكد أنني راجعت مقارنة هذا الشيت").check();
  await page.getByRole("button", { name: "اعتماد جميع الاقتراحات بعد المراجعة" }).click();
  // اعتماد الاقتراحات يغيّر الخريطة، لذلك يجب إعادة تأكيد المقارنة للنسخة الجديدة قبل الحفظ.
  await page.getByLabel("أؤكد أنني راجعت مقارنة هذا الشيت").check();
  const saveTemplate = page.getByRole("button", { name: "حفظ كقالب" });
  await saveTemplate.waitFor({ state: "visible" });
  if (await saveTemplate.isDisabled()) throw new Error("زر حفظ قالب برنامج الصيدلية ظل غير مفعّل بعد الاعتماد ومراجعة المقارنة.");
  await saveTemplate.click();
  await page.getByText("تم حفظ خريطة الأعمدة باسم «برنامج الصيدلية» محليًا.").waitFor();
  await page.screenshot({ path: path.join(outputDirectory, "01-review-and-template.png"), fullPage: true });

  await page.getByRole("button", { name: "إلغاء" }).first().click();
  await page.getByText("تدقيق مصدر البيانات").waitFor();
  await page.locator('input[type="file"]').first().setInputFiles(changedFile);
  await page.getByRole("heading", { name: "تحذير: ترتيب الأعمدة لا يطابق القالب المعتمد" }).waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "أفهم الاختلاف — مراجعة خريطة جديدة" }).waitFor();
  await page.screenshot({ path: path.join(outputDirectory, "02-column-order-warning.png"), fullPage: true });

  if (errors.length) throw new Error(`أخطاء متصفح أثناء اختبار التدفق: ${errors.join(" | ")}`);
  console.log("VERIFY_IMPORT_REVIEW_FLOW_OK");
} finally {
  await browser.close();
}
