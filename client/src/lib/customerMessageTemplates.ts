export type CustomerMessageVariables = {
  customerName: string;
  productName: string;
  productCode?: string | null;
  requestedQuantity: string | number;
};

const placeholders: Record<keyof CustomerMessageVariables, RegExp> = {
  customerName: /\{\{customerName\}\}/g,
  productName: /\{\{productName\}\}/g,
  productCode: /\{\{productCode\}\}/g,
  requestedQuantity: /\{\{requestedQuantity\}\}/g,
};

export const defaultCustomerAvailabilityTemplate = "أهلًا {{customerName}}، الصنف «{{productName}}» أصبح متاحًا الآن في الصيدلية. يمكنك التواصل معنا لتأكيد الاستلام.";

export function renderCustomerMessageTemplate(template: string, variables: CustomerMessageVariables) {
  return (Object.keys(placeholders) as Array<keyof CustomerMessageVariables>).reduce((rendered, key) => rendered.replace(placeholders[key], String(variables[key] ?? "")), template).replace(/\{\{[^}]+\}\}/g, "");
}

export const customerMessageTemplateVariables = ["{{customerName}}", "{{productName}}", "{{productCode}}", "{{requestedQuantity}}"] as const;
