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
  if (process.env.CAPTURE_EDITOR_SCREEN === "1") {
    await page.screenshot({ path: "/home/ubuntu/pharmacy-manager-intelligence-preview-columns.png", fullPage: true });
  }

  const columnA = editor.getByTestId("column-choice-0");
  const columnB = editor.getByTestId("column-choice-1");
  const titleA = editor.getByTestId("column-title-0");
  const titleB = editor.getByTestId("column-title-1");
  const initialTitleA = await titleA.innerText();
  const initialTitleB = await titleB.innerText();
  await columnB.click();
  await editor.getByTestId("move-column-right").click();
  if (await titleA.innerText() !== initialTitleB) throw new Error("لم ينقل سهم اليمين اسم العمود إلى موضعه المرئي الجديد.");
  await editor.locator("button[data-history-count]").first().click();
  if (await titleA.innerText() !== initialTitleA) throw new Error("لم يُستعد ترتيب أسماء الأعمدة بعد التراجع.");

  await editor.getByLabel("اسم المدير لحفظ ترتيب الأعمدة").fill("مدير اختبار ترتيب الأعمدة");
  await editor.getByTestId("manager-layout-name").fill("ترتيب الاختبار الشهري");
  await editor.getByTestId("manager-layout-description").fill("مراجعة أعمدة ملف الصيدلية في بداية الشهر");
  await editor.getByTestId("save-manager-layout").click();
  const savedLayoutLabel = "ترتيب الاختبار الشهري — مدير اختبار ترتيب الأعمدة";
  await page.waitForFunction((label) => Array.from(document.querySelectorAll('[data-testid="load-manager-layout"] option')).some((option) => option.textContent === label), savedLayoutLabel, { timeout: 2_000 });
  await editor.getByText("مراجعة أعمدة ملف الصيدلية في بداية الشهر", { exact: true }).waitFor({ timeout: 2_000 });

  const dragZone = editor.locator('[aria-label="سحب وإفلات ترتيب الأعمدة"]');
  const dragCards = dragZone.locator('button[draggable="true"]');
  await dragCards.nth(1).dragTo(dragCards.nth(0));
  if (await titleA.innerText() !== initialTitleB) throw new Error("لم يبدل السحب والإفلات عنوان العمود عند الإسقاط.");
  await editor.getByTestId("load-manager-layout").selectOption({ label: savedLayoutLabel });
  if (await titleA.innerText() !== initialTitleA) throw new Error("لم يستعد تحميل ترتيب المدير عنوان العمود المحفوظ.");

  const organization = editor.getByTestId("manager-layout-organization");
  await organization.getByTestId("manager-layout-search").fill("الشهري");
  await organization.getByText("ترتيب الاختبار الشهري", { exact: true }).first().click();
  await organization.getByTestId("manager-layout-branch").fill("فرع الاختبار");
  await organization.getByLabel("وسم لوني للترتيب").fill("مخزون");
  await organization.getByTestId("add-manager-layout-tag").click();
  await organization.getByTestId("save-layout-organization").click();
  await organization.locator('[data-testid^="layout-organization-"]').getByText("مخزون", { exact: true }).waitFor({ timeout: 2_000 });
  const branchSuggestionButton = organization.locator('[data-testid^="suggest-layout-"]').first();
  await branchSuggestionButton.click();
  await organization.getByText("مقترح للفرع", { exact: true }).waitFor({ timeout: 2_000 });
  if (await titleA.innerText() !== initialTitleA) throw new Error("طُبّق الترتيب المقترح للفرع تلقائيًا بدل انتظار اختيار المستخدم.");
  await editor.getByRole("tab", { name: "4. راجع واعتمد" }).click();
  const quickApply = editor.getByTestId("quick-apply-layout-after-preview");
  await quickApply.waitFor({ state: "visible", timeout: 2_000 });
  await quickApply.click();
  await editor.getByTestId("column-arrangement-screen").waitFor({ state: "visible", timeout: 2_000 });
  if (await titleA.innerText() !== initialTitleA) throw new Error("لم يطبق الاختصار اليدوي الترتيب المحفوظ كما تمت معاينته.");
  await editor.getByTestId("branch-usage-فرع الاختبار").getByText("1 تطبيقات يدوية", { exact: true }).waitFor({ timeout: 2_000 });
  if (process.env.CAPTURE_LAYOUT_ORGANIZATION === "1") {
    await page.screenshot({ path: "/home/ubuntu/pharmacy-manager-intelligence-layout-organization.png", fullPage: true });
  }

  const titleBBeforeSuggestion = await titleB.innerText();
  const suggestionButton = editor.getByTestId("auto-correction-button");
  if (await suggestionButton.isEnabled()) {
    await suggestionButton.click();
    if (await titleB.innerText() !== titleBBeforeSuggestion) throw new Error("طُبق التصحيح المقترح قبل موافقة المدير.");
    await editor.getByTestId("approve-auto-correction").click();
    if (await titleB.innerText() === titleBBeforeSuggestion) throw new Error("لم يطبق التصحيح المقترح بعد موافقة المدير.");
    await editor.getByTestId("load-manager-layout").selectOption({ label: savedLayoutLabel });
    if (await titleB.innerText() !== titleBBeforeSuggestion) throw new Error("لم يستعد ترتيب المدير حالة العناوين المحفوظة.");
  }

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
  await editor.getByTestId("exclude-column").click();
  await editor.getByTestId("restore-column").click();
  await editor.getByRole("button", { name: "حذف آخر عمود يدوي" }).click();

  await page.getByRole("button", { name: "اعتماد جميع الاقتراحات بعد المراجعة" }).click();
  await page.getByText("أؤكد أنني راجعت مقارنة هذا الشيت", { exact: true }).click();
  await page.getByRole("button", { name: /بدء التحليل بعد الاعتماد/ }).click();
  await page.getByRole("button", { name: /أوافق وأبدأ التحليل/ }).click();
  await page.getByRole("button", { name: "فواتير الموردين", exact: true }).click();
  const invoiceCenter = page.getByTestId("invoice-reconciliation-center");
  await invoiceCenter.waitFor({ state: "visible", timeout: 10_000 });
  if (process.env.CAPTURE_INVOICE_CENTER === "1") {
    await page.screenshot({ path: "/home/ubuntu/pharmacy-manager-intelligence-invoice-center.png", fullPage: true });
  }
  if (await invoiceCenter.getByText("لا توجد أصناف صفراء أو طلبات مفتوحة لتسويتها بعد", { exact: true }).count()) {
    console.log("VERIFY_INVOICE_EMPTY_STATE_OK");
  } else {
    await invoiceCenter.locator("textarea").fill("65057 BLESS HOLD HAIR GEL 1");
    await invoiceCenter.getByRole("button", { name: "تحويل النص إلى بنود قابلة للمراجعة" }).click();
    await invoiceCenter.locator('input[type="checkbox"]').check();
    await invoiceCenter.getByTestId("approve-invoice-settlement").click();
    await invoiceCenter.getByText("اعتمدت تسوية", { exact: false }).waitFor({ timeout: 3_000 });
  }

  console.log("VERIFY_EDITABLE_SHEET_UNDO_OK");
} finally {
  await browser.close();
}
