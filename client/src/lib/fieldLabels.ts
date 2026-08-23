import type { CanonicalField } from "./pharmacyEngine";

export const fieldArabicName: Record<CanonicalField, string> = {
  item_code: "كود الصنف", item_name: "اسم الصنف", company: "الشركة", category: "التصنيف", item_type: "نوع الصنف", unit: "الوحدة",
  quantity_sold: "الكمية المباعة", stock_quantity: "رصيد المخزون", reorder_level: "حد إعادة الطلب", expiry_date: "تاريخ الانتهاء", sale_price: "سعر البيع", sales_total: "إجمالي المبيعات",
  sales_quantity: "كمية المبيعات", invoice_number: "رقم الفاتورة", sale_date: "تاريخ البيع", sale_time: "وقت البيع", customer: "العميل", employee: "الموظف", branch: "الفرع",
  cost_price: "سعر التكلفة", total_cost: "إجمالي التكلفة", profit: "الربح", profit_margin: "هامش الربح", discount: "نسبة الخصم", discount_value: "قيمة الخصم",
  expense_date: "تاريخ المصروف", expense_type: "نوع المصروف", expense_amount: "قيمة المصروف", payment_method: "طريقة الدفع", user: "المستخدم", notes: "ملاحظات",
  transaction_date: "تاريخ الحركة", transaction_type: "نوع الحركة", account: "الحساب", amount: "المبلغ",
};
