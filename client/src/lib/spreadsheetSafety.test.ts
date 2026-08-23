import { describe, expect, it } from "vitest";
import { assertSpreadsheetFileSafety, assertWorkbookSafety, MAX_SPREADSHEET_FILE_BYTES } from "./spreadsheetSafety";

describe("حواجز أمان ملفات الجداول", () => {
  it("يرفض نوع الملف والحجم غير الآمنين قبل القراءة", () => {
    expect(() => assertSpreadsheetFileSafety({ name: "invoice.exe", size: 10 })).toThrow("Excel أو CSV");
    expect(() => assertSpreadsheetFileSafety({ name: "large.xlsx", size: MAX_SPREADSHEET_FILE_BYTES + 1 })).toThrow("20 ميجابايت");
  });

  it("يرفض الشيتات ذات النطاقات المفرطة قبل تحويل الصفوف", () => {
    expect(() => assertWorkbookSafety({ SheetNames: ["مفرط"], Sheets: { مفرط: { "!ref": "A1:ZZ10000" } } } as never)).toThrow("250,000");
  });
});
