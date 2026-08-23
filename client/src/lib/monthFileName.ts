const ARABIC_MONTHS: Record<string, number> = { "يناير": 1, "فبراير": 2, "مارس": 3, "ابريل": 4, "أبريل": 4, "مايو": 5, "يونيو": 6, "يوليو": 7, "اغسطس": 8, "أغسطس": 8, "سبتمبر": 9, "اكتوبر": 10, "أكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12 };
const ENGLISH_MONTHS: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

export function monthFromFileName(fileName: string): number | undefined {
  const name = fileName.replace(/\.[^.]+$/, "").toLowerCase();
  for (const [label, month] of Object.entries(ARABIC_MONTHS)) if (name.includes(label)) return month;
  for (const [label, month] of Object.entries(ENGLISH_MONTHS)) if (name.includes(label)) return month;
  const match = name.match(/(?:^|[^0-9])(0?[1-9]|1[0-2])(?:[^0-9]|$)/);
  return match ? Number(match[1]) : undefined;
}
