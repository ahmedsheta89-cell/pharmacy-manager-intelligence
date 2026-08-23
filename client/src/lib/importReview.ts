/**
 * سياسة اعتماد الاستيراد.
 * الاقتراح الآلي لا يساوي قراراً: تظل كل المطابقات الجديدة في حالة «مقترح»
 * حتى يعتمدها المدير أو يبدلها أو يتجاهلها صراحةً.
 */
import { fieldArabicName } from "./fieldLabels";
import { isApprovedMapping as approvedMapping } from "./mappingApproval";
export { isApprovedMapping } from "./mappingApproval";
import { refreshImportedInspection, type CanonicalField, type ColumnMapping, type ImportInspection } from "./pharmacyEngine";

export type MappingApprovalStatus = "suggested" | "approved" | "overridden" | "ignored";
export type MappingChoice = CanonicalField | "ignore";

export type ImportReadiness = {
  ready: boolean;
  pendingColumns: number;
  unresolvedCriticalFields: string[];
  approvedColumns: number;
  overriddenColumns: number;
  ignoredColumns: number;
};

/**
 * لا يُستنتج التحليل من تخمينات غير معتمدة. الملفات القديمة التي لا تحمل حالة
 * الاعتماد تبقى قابلة للاستعادة لضمان التوافق العكسي، أما كل فحص جديد فيحمل
 * الحالة suggested صراحةً.
 */
export function mappingLabel(field: MappingChoice): string {
  return field === "ignore" ? "تجاهل من التحليل" : fieldArabicName[field];
}

function withMappingChange(mapping: ColumnMapping, choice: MappingChoice, status: MappingApprovalStatus): ColumnMapping {
  const proposedField = mapping.proposedField ?? mapping.field;
  return {
    ...mapping,
    proposedField,
    field: choice === "ignore" ? "unknown" : choice,
    approvalStatus: status,
    approvedAt: status === "suggested" ? undefined : new Date().toISOString(),
    approvalReason:
      status === "ignored"
        ? "قرر المدير استبعاد هذا العمود من التحليل."
        : status === "overridden"
          ? `استبدل المدير الاقتراح (${proposedField === "unknown" ? "غير معروف" : fieldArabicName[proposedField]}) بالحقل ${choice === "ignore" ? "تجاهل" : fieldArabicName[choice]}.`
          : "اعتمد المدير الاقتراح كما هو.",
  };
}

function updateInspection(
  inspection: ImportInspection,
  sheetName: string,
  change: (mapping: ColumnMapping) => ColumnMapping,
): ImportInspection {
  const revised = {
    ...inspection,
    sheets: inspection.sheets.map((sheet) => sheet.name === sheetName ? { ...sheet, mappings: sheet.mappings.map(change) } : sheet),
  };
  return refreshImportedInspection(revised);
}

/** يعتمد المدير كل الاقتراحات المعروضة للشيت المحدد في إجراء واحد واضح. */
export function approveSheetSuggestions(inspection: ImportInspection, sheetName: string): ImportInspection {
  return updateInspection(inspection, sheetName, (mapping) => {
    if (mapping.approvalStatus && mapping.approvalStatus !== "suggested") return mapping;
    return withMappingChange(mapping, mapping.field === "unknown" ? "ignore" : mapping.field, mapping.field === "unknown" ? "ignored" : "approved");
  });
}

/** يعتمد المدير اقتراحات كل الشيتات بعد مراجعة شاشة المعاينة. */
export function approveAllSuggestions(inspection: ImportInspection): ImportInspection {
  return inspection.sheets.reduce((current, sheet) => approveSheetSuggestions(current, sheet.name), inspection);
}

/** يغير المدير معنى عمود بعينه أو يستبعده، وتُعاد الحسابات محلياً من الخريطة الجديدة. */
export function setColumnMapping(
  inspection: ImportInspection,
  sheetName: string,
  dataColumn: string | undefined,
  sourceColumn: string,
  choice: MappingChoice,
): ImportInspection {
  return updateInspection(inspection, sheetName, (mapping) => {
    const sameColumn = dataColumn ? mapping.dataColumn === dataColumn : mapping.sourceColumn === sourceColumn;
    if (!sameColumn) return mapping;
    const proposed = mapping.proposedField ?? mapping.field;
    const status: MappingApprovalStatus = choice === "ignore" ? "ignored" : choice === proposed ? "approved" : "overridden";
    return withMappingChange(mapping, choice, status);
  });
}

function readableCriticalField(field: CanonicalField): string {
  return fieldArabicName[field];
}

/**
 * الحد الأدنى للتحليل التنفيذي هو معرفة الصنف، مع وجود مقياس واحد على الأقل
 * للحركة أو المخزون. لا نفرض حقول ربحية أو سعرية حتى لا نظهر قيماً غير موجودة.
 */
export function getImportReadiness(inspection: ImportInspection): ImportReadiness {
  const mappings = inspection.sheets.flatMap((sheet) => sheet.mappings);
  const pendingColumns = mappings.filter((mapping) => mapping.approvalStatus === "suggested").length;
  const approved = mappings.filter((mapping) => mapping.approvalStatus === "approved").length;
  const overridden = mappings.filter((mapping) => mapping.approvalStatus === "overridden").length;
  const ignored = mappings.filter((mapping) => mapping.approvalStatus === "ignored").length;
  const active = mappings.filter(approvedMapping);
  const fields = new Set(active.map((mapping) => mapping.field).filter((field): field is CanonicalField => field !== "unknown"));
  const unresolvedCriticalFields: string[] = [];
  if (!fields.has("item_name")) unresolvedCriticalFields.push(readableCriticalField("item_name"));
  if (!["stock_quantity", "quantity_sold", "sales_quantity", "sales_total"].some((field) => fields.has(field as CanonicalField))) {
    unresolvedCriticalFields.push("مقياس حركة أو مخزون واحد على الأقل");
  }
  return {
    ready: pendingColumns === 0 && unresolvedCriticalFields.length === 0,
    pendingColumns,
    unresolvedCriticalFields,
    approvedColumns: approved,
    overriddenColumns: overridden,
    ignoredColumns: ignored,
  };
}

export function hasManagerReviewed(inspection: ImportInspection): boolean {
  return inspection.sheets.some((sheet) => sheet.mappings.some((mapping) => mapping.approvalStatus !== undefined));
}
