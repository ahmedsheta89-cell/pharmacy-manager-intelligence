/**
 * نبض العيادة التنفيذي — إعدادات تقرير المدير.
 * تحفظ الهوية داخل المتصفح فقط حتى يظل التقرير قابلًا للتخصيص دون نقل بيانات الصيدلية.
 */

export interface ReportProfile {
  pharmacyName: string;
  branchName: string;
  managerName: string;
  reportTitle: string;
  footerNote: string;
  logoDataUrl?: string;
}

export interface DeliveryPreferences {
  enabled: boolean;
  frequency: "weekly" | "monthly";
  weekday: string;
  time: string;
  recipients: string;
}

export interface ReportPreferences {
  profile: ReportProfile;
  delivery: DeliveryPreferences;
}

export const reportPreferencesKey = "pmi-report-preferences";

export const defaultReportPreferences: ReportPreferences = {
  profile: {
    pharmacyName: "صيدليتي",
    branchName: "الفرع الرئيسي",
    managerName: "مدير الصيدلية",
    reportTitle: "تقرير المدير التنفيذي",
    footerNote: "قرار أوضح يبدأ من بيانات منظمة.",
  },
  delivery: {
    enabled: false,
    frequency: "weekly",
    weekday: "الأحد",
    time: "09:00",
    recipients: "",
  },
};

export function loadReportPreferences(): ReportPreferences {
  try {
    const stored = localStorage.getItem(reportPreferencesKey);
    if (!stored) return defaultReportPreferences;
    const value = JSON.parse(stored) as Partial<ReportPreferences>;
    return {
      profile: { ...defaultReportPreferences.profile, ...value.profile },
      delivery: { ...defaultReportPreferences.delivery, ...value.delivery },
    };
  } catch {
    return defaultReportPreferences;
  }
}

export function saveReportPreferences(preferences: ReportPreferences) {
  try {
    localStorage.setItem(reportPreferencesKey, JSON.stringify(preferences));
  } catch {
    // تعذر الحفظ لا يمنع تحليل البيانات أو تصدير التقرير.
  }
}

