/** تعرض رقمًا محدودًا في قوائم الموظف، ولا تعد بديلًا عن حارس الخادم. */
export function maskCustomerPhone(phone: string) {
  const compact = phone.replace(/[\s()-]/g, "");
  if (compact.length <= 4) return "••••";
  const visibleStart = Math.min(3, Math.max(1, compact.length - 3));
  return `${compact.slice(0, visibleStart)}••••${compact.slice(-3)}`;
}

export function presentCustomerRequestForRole<T extends { customerPhone: string; normalizedCustomerPhone: string }>(request: T, shouldMaskPhone: boolean) {
  if (!shouldMaskPhone) return { ...request, phoneMasked: false as const };
  const { normalizedCustomerPhone: _normalizedCustomerPhone, customerPhone, ...safeRequest } = request;
  return { ...safeRequest, customerPhone: maskCustomerPhone(customerPhone), phoneMasked: true as const };
}
