const arabicNumbers: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".", "٬": "," };

export function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (value === null || value === undefined || value === "") return undefined;
  const normalized = String(value)
    .replace(/[٠-٩٫٬]/g, (character) => arabicNumbers[character] ?? character)
    .replace(/[ج.م|EGP|£|,\s]/gi, "")
    .replace(/\((.*)\)/, "-$1");
  const result = Number(normalized);
  return Number.isFinite(result) ? result : undefined;
}
