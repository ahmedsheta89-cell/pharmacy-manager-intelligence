export function formatEGP(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "غير متاح";
  return new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(value);
}

export function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(value);
}
