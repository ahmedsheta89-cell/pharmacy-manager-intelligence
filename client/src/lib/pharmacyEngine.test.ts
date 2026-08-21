import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { applySheetEditorConfig, inspectPharmacyFile, refreshImportedInspection } from "./pharmacyEngine";
import { analyzeProductMovement } from "./productMovementEngine";
import { analyzePharmacyData } from "./analyticsEngine";
import { approveAllSuggestions } from "./importReview";

describe("inspectPharmacyFile", () => {
  it("يصحح انزياح رأس تقرير البرنامج ويلتقط الاسم والرصيد والمبيعات من المواضع الفعلية", async () => {
    const workbook = XLSX.utils.book_new();
    const rows = [
      ["الموظف", "إجمالى س.بيع", "الرصيد", "الوحدة", "الكمية", "المنشأ", "الشركة", "الإسم", "الكود"],
      [1250, 0, "علبة", 5, "محلي", "شركة اختبار", "صنف برصيد صفر", "A-01", null],
      [360, 3, "علبة", 2, "محلي", "شركة اختبار", "صنف متاح", "A-02", null],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = new File([bytes], "program-export.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const inspection = approveAllSuggestions(await inspectPharmacyFile(file));
    const sheet = inspection.sheets[0];
    const movement = analyzeProductMovement(inspection.sheets);

    expect(sheet.headers).toEqual(["إجمالى س.بيع", "الرصيد", "الوحدة", "الكمية", "المنشأ", "الشركة", "الإسم", "الكود"]);
    expect(sheet.excludedColumns).toEqual([]);
    expect(sheet.removedHeaders).toEqual([expect.objectContaining({ headerColumn: "A", title: "الموظف", reason: expect.stringContaining("قيم العمود A محفوظة") })]);
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "الإسم")?.field).toBe("item_name");
    expect(sheet.cleanRecords[0]?.["الإسم"]).toBe("صنف برصيد صفر");
    expect(sheet.cleanRecords[0]?.["الرصيد"]).toBe(0);
    expect(sheet.cleanRecords[0]?.["إجمالى س.بيع"]).toBe(1250);
    expect(sheet.headerDataOffset).toBe(1);
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "إجمالى س.بيع")).toMatchObject({ dataColumn: "A", headerColumn: "B", adjustedForHeaderShift: true });
    expect(sheet.cleanRecords[0]?.__metrics.unitSalePrice).toBe(250);
    expect(movement.metrics.zeroBalanceCount).toBe(1);
    expect(movement.zeroBalance[0]).toMatchObject({ itemName: "صنف برصيد صفر", sales: 1250 });
  });

  it("لا يخترع ربحًا أو هامشًا عندما يفتقد التقرير تكلفة الشراء", async () => {
    const workbook = XLSX.utils.book_new();
    const rows = [
      ["إجمالى س.بيع", "الرصيد", "الوحدة", "الكمية", "المنشأ", "الشركة", "الإسم", "الكود"],
      [1250, 0, "علبة", 5, "محلي", "شركة اختبار", "صنف بلا تكلفة", "A-01"],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = new File([bytes], "no-cost-export.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const inspection = approveAllSuggestions(await inspectPharmacyFile(file));
    const analytics = analyzePharmacyData(inspection.sheets);

    expect(analytics?.metrics.sales).toMatchObject({ value: 1250, availability: "available" });
    expect(analytics?.metrics.cost.availability).toBe("unavailable");
    expect(analytics?.metrics.grossProfit.availability).toBe("unavailable");
    expect(analytics?.metrics.grossMargin.availability).toBe("unavailable");
    expect(analytics?.summary.recommendations.join(" ")).toContain("تكلفة الشراء");
  });

  it("يلتقط سعر الشراء وسعر الجمهور العربيين ويحسب الربح عندما يردان كحقول صريحة", async () => {
    const workbook = XLSX.utils.book_new();
    const rows = [
      ["كود الصنف", "اسم الصنف", "سعر الشراء", "سعر الجمهور", "الرصيد", "الكمية المباعة", "إجمالي البيع"],
      ["A-11", "صنف بأسعار صريحة", 40, 65, 12, 4, 260],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = new File([bytes], "priced-export.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const inspection = approveAllSuggestions(await inspectPharmacyFile(file));
    const sheet = inspection.sheets[0];
    const analytics = analyzePharmacyData(inspection.sheets);

    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "سعر الشراء")?.field).toBe("cost_price");
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "سعر الجمهور")?.field).toBe("sale_price");
    expect(sheet.cleanRecords[0]?.__metrics.unitCost).toBe(40);
    expect(sheet.cleanRecords[0]?.__metrics.unitSalePrice).toBe(65);
    expect(analytics?.metrics.cost).toMatchObject({ value: 160, availability: "available" });
    expect(analytics?.metrics.grossProfit).toMatchObject({ value: 100, availability: "available" });
  });

  it("يعيد احتساب جلسة قديمة ولا يبقي ربحًا أو هامشًا مصطنعين دون تكلفة", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["إجمالي المبيعات", "الكمية", "اسم الصنف"],
      [150, 3, "صنف تحقق"],
    ]), "Sheet1");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = new File([bytes], "stale-session.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const inspection = await inspectPharmacyFile(file);
    const stale = structuredClone(inspection);
    stale.sheets[0].cleanRecords[0].__metrics = { sales: 150, quantity: 3, cost: 0, profit: 150, profitMargin: 100 };

    const refreshed = refreshImportedInspection(stale);
    expect(refreshed.sheets[0].cleanRecords[0].__metrics.cost).toBeUndefined();
    expect(refreshed.sheets[0].cleanRecords[0].__metrics.profit).toBeUndefined();
    expect(refreshed.sheets[0].cleanRecords[0].__metrics.profitMargin).toBeUndefined();
  });

  it("يطبق محرر الشيت على المعاينة فقط: صف رأس يدوي وبداية بيانات واستبعاد صف وعمود بداية", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["تقرير تجريبي لا يدخل البيانات"],
      ["ملاحظات داخلية"],
      ["كود الصنف", "اسم الصنف", "الرصيد", "إجمالي البيع"],
      ["IGNORE", "صف يلغيه المدير", 99, 999],
      ["C-01", "صنف معتمد", 4, 120],
      ["C-02", "صنف ثانٍ", 0, 70],
    ]), "Sheet1");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const inspection = await inspectPharmacyFile(new File([bytes], "manual-editor.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const edited = applySheetEditorConfig(inspection, "Sheet1", { headerRowIndex: 2, dataStartRowIndex: 3, firstDataColumnIndex: 0, excludedRowNumbers: [4] });
    const sheet = edited.sheets[0];

    expect(sheet.editorConfig).toMatchObject({ headerRowIndex: 2, dataStartRowIndex: 3, firstDataColumnIndex: 0, excludedRowNumbers: [4] });
    expect(sheet.cleanRecords).toHaveLength(2);
    expect(sheet.cleanRecords.map((record) => record["كود الصنف"])).toEqual(["C-01", "C-02"]);
    expect(sheet.cleanRecords.map((record) => record.__rowIndex)).toEqual([5, 6]);
    expect(sheet.sourceMatrix?.[3]?.[1]).toBe("صف يلغيه المدير");
    expect(sheet.quality.issues).toContainEqual(expect.objectContaining({ type: "صف مستبعد بقرار المدير", count: 1 }));

    const shiftedStart = applySheetEditorConfig(edited, "Sheet1", { firstDataColumnIndex: 1 });
    expect(shiftedStart.sheets[0].headers[0]).toBe("اسم الصنف");
    expect(shiftedStart.sheets[0].mappings[0]?.dataColumn).toBe("B");
  });

  it("يقصر المعاينة على نطاق المدير ويضيف أعمدة دمج وتقسيم نصية من دون تغيير المصدر", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["ملاحظات تمهيدية"],
      ["الاسم الأول", "اسم العائلة", "كود-شركة", "الرصيد"],
      ["سارة", "أحمد", "P-10-ALPHA", 6],
      ["مها", "سالم", "P-11-BETA", 2],
      ["صف خارج النطاق", "لا يقرأ", "P-12-GAMMA", 9],
    ]), "Sheet1");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const inspection = await inspectPharmacyFile(new File([bytes], "range-transform.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const edited = applySheetEditorConfig(inspection, "Sheet1", {
      headerRowIndex: 1,
      dataStartRowIndex: 2,
      firstDataColumnIndex: 0,
      lastDataRowIndex: 3,
      lastDataColumnIndex: 3,
      textTransforms: [
        { id: "full-name", type: "merge", sources: ["الاسم الأول", "اسم العائلة"], target: "الاسم الكامل", separator: " " },
        { id: "split-code", type: "split", source: "كود-شركة", target: "جزء الكود", separator: "-", parts: 3 },
      ],
    });
    const sheet = edited.sheets[0];

    expect(sheet.cleanRecords).toHaveLength(2);
    expect(sheet.cleanRecords[0]?.["الاسم الكامل"]).toBe("سارة أحمد");
    expect(sheet.cleanRecords[0]?.["جزء الكود 1"]).toBe("P");
    expect(sheet.cleanRecords[0]?.["جزء الكود 3"]).toBe("ALPHA");
    expect(sheet.mappings.map((mapping) => mapping.sourceColumn)).toEqual(expect.arrayContaining(["الاسم الكامل", "جزء الكود 1", "جزء الكود 2", "جزء الكود 3"]));
    expect(sheet.sourceMatrix?.[4]?.[0]).toBe("صف خارج النطاق");
    expect(sheet.editorConfig).toMatchObject({ lastDataRowIndex: 3, lastDataColumnIndex: 3, textTransforms: expect.arrayContaining([expect.objectContaining({ id: "full-name" })]) });
  });

  it("يقرأ العمود وفق عنوانه الذي يكتبه المدير ويطبق تعديل الخلية على المعاينة لا على المصدر", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["اسم الشركة", "اسم الصنف", "سعر الشراء"],
      ["C-900", "صنف قابل للتصحيح", 42],
    ]), "Sheet1");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const inspection = await inspectPharmacyFile(new File([bytes], "editable-header.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const edited = applySheetEditorConfig(inspection, "Sheet1", {
      headerRowIndex: 0,
      dataStartRowIndex: 1,
      firstDataColumnIndex: 0,
      headerOverrides: { 0: "كود الصنف", 2: "سعر البيع" },
      cellOverrides: { "1:2": "65" },
    });
    const sheet = edited.sheets[0];

    expect(sheet.headers).toEqual(["كود الصنف", "اسم الصنف", "سعر البيع"]);
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "كود الصنف")?.field).toBe("item_code");
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "سعر البيع")?.field).toBe("sale_price");
    expect(sheet.cleanRecords[0]?.["كود الصنف"]).toBe("C-900");
    expect(sheet.cleanRecords[0]?.["سعر البيع"]).toBe(65);
    expect(sheet.sourceMatrix?.[0]?.[0]).toBe("اسم الشركة");
    expect(sheet.sourceMatrix?.[1]?.[2]).toBe(42);
  });

  it("يستبعد أعمدة محددة ويضيف عمودًا محليًا للمعاينة من دون المساس بورقة المصدر", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["كود الصنف", "اسم الصنف", "ملاحظة داخلية", "الرصيد"],
      ["C-300", "صنف تحكم كامل", "لا تدخل التحليل", 6],
    ]), "Sheet1");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const inspection = await inspectPharmacyFile(new File([bytes], "local-columns.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const edited = applySheetEditorConfig(inspection, "Sheet1", {
      headerRowIndex: 0,
      dataStartRowIndex: 1,
      firstDataColumnIndex: 0,
      lastDataColumnIndex: 4,
      ignoredColumnIndexes: [2],
      manualColumns: [{ id: "priority", title: "تصنيف المدير" }],
      cellOverrides: { "1:4": "حرج" },
    });
    const sheet = edited.sheets[0];

    expect(sheet.headers).toEqual(expect.arrayContaining(["كود الصنف", "اسم الصنف", "الرصيد", "تصنيف المدير"]));
    expect(sheet.headers).not.toContain("ملاحظة داخلية");
    expect(sheet.cleanRecords[0]?.["تصنيف المدير"]).toBe("حرج");
    expect(sheet.excludedColumns).toEqual(expect.arrayContaining([expect.objectContaining({ dataColumn: "C", sourceColumn: "ملاحظة داخلية" })]));
    expect(sheet.sourceMatrix?.[0]?.[2]).toBe("ملاحظة داخلية");
    expect(sheet.sourceMatrix?.[1]?.[2]).toBe("لا تدخل التحليل");
  });

  it("يضيف صفًا محليًا قابلاً للتحرير إلى القراءة من دون تعديل صفوف Excel الأصلية", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["كود الصنف", "اسم الصنف", "الرصيد"],
      ["C-400", "صنف المصدر", 3],
    ]), "Sheet1");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const inspection = await inspectPharmacyFile(new File([bytes], "local-row.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const edited = applySheetEditorConfig(inspection, "Sheet1", {
      headerRowIndex: 0,
      dataStartRowIndex: 1,
      firstDataColumnIndex: 0,
      lastDataRowIndex: 2,
      manualRows: [{ id: "director-row" }],
      cellOverrides: { "2:0": "C-401", "2:1": "صنف محلي", "2:2": "8" },
    });
    const sheet = edited.sheets[0];

    expect(sheet.cleanRecords).toHaveLength(2);
    expect(sheet.cleanRecords[1]).toMatchObject({ "كود الصنف": "C-401", "اسم الصنف": "صنف محلي", "الرصيد": 8 });
    expect(sheet.editorConfig?.manualRows).toEqual([{ id: "director-row" }]);
    expect(sheet.sourceMatrix).toHaveLength(2);
    expect(sheet.sourceMatrix?.[1]).toEqual(["C-400", "صنف المصدر", 3]);
  });
});
