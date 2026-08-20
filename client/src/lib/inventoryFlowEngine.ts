import type { CoverageGapItem, MovementPeriod, ProductMovementAnalysis, ProductMovementItem } from "@/lib/productMovementEngine";

export type InventoryFlowMonth = {
  key: string;
  label: string;
  openingStock?: number;
  closingStock?: number;
  salesValue?: number;
  outboundUnits?: number;
  inferredReplenishmentUnits?: number;
  zeroBalanceItems: number;
  unreplenishedOpportunitySales?: number;
  unreplenishedOpportunityGrossProfit?: number;
};

export type UnreplenishedFocusItem = ProductMovementItem & {
  periodLabel: string;
  previousPeriodLabel: string;
  historicalDemand: number;
  closingStock: number;
  inferredReplenishmentUnits: number;
  opportunitySales?: number;
  opportunityGrossProfit?: number;
};

export type InventoryFlowAnalysis = {
  available: boolean;
  comparable: boolean;
  months: InventoryFlowMonth[];
  unreplenishedItems: UnreplenishedFocusItem[];
  focusItems: CoverageGapItem[];
  dataGaps: string[];
  notes: string[];
  metrics: {
    currentStockPurchaseValue?: number;
    currentStockPublicValue?: number;
    currentStockPotentialGrossProfit?: number;
    zeroMovementPurchaseValue?: number;
    zeroMovementPublicValue?: number;
    zeroMovementPotentialGrossProfit?: number;
    currentZeroBalanceCount: number;
    highPriorityCount: number;
    inferredReplenishmentUnits?: number;
    outboundUnits?: number;
    unreplenishedOpportunitySales?: number;
    unreplenishedOpportunityGrossProfit?: number;
  };
};

function sumKnown(values: Array<number | undefined>) {
  const known = values.filter((value): value is number => value !== undefined);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : undefined;
}

function periodStock(item: ProductMovementItem, period: MovementPeriod) {
  return item.periods[period.key]?.stock;
}

function periodQuantity(item: ProductMovementItem, period: MovementPeriod) {
  return item.periods[period.key]?.quantity;
}

function periodSales(item: ProductMovementItem, period: MovementPeriod) {
  return item.periods[period.key]?.sales;
}

/**
 * يقرأ لقطات الرصيد وحركة البيع المتتابعة. «التعويض المستنتج» ليس شراءً مؤكّدًا:
 * إنه صافي ما يلزم حسابيًا لانتقال الرصيد بين لقطة سابقة ولاحقة بعد طرح الكمية الخارجة.
 */
export function analyzeInventoryFlow(movement: ProductMovementAnalysis): InventoryFlowAnalysis {
  const periods = movement.periods;
  const currentPeriod = periods.at(-1);
  const comparable = periods.length >= 2;
  const currentStockPurchaseValue = sumKnown(movement.items.map((item) => item.stock !== undefined && item.purchasePrice !== undefined ? Math.max(item.stock, 0) * item.purchasePrice : undefined));
  const currentStockPublicValue = sumKnown(movement.items.map((item) => item.stock !== undefined && item.publicPrice !== undefined ? Math.max(item.stock, 0) * item.publicPrice : undefined));
  const currentStockPotentialGrossProfit = currentStockPurchaseValue !== undefined && currentStockPublicValue !== undefined ? currentStockPublicValue - currentStockPurchaseValue : undefined;
  const highPriorityCount = movement.coverageGaps.filter((item) => item.priority === "عاجل" || item.priority === "مرتفع").length;
  const dataGaps = [...movement.dataGaps];
  const notes = [
    "صافي التعويض المستنتج = رصيد نهاية الشهر + الكمية الخارجة − رصيد بداية الشهر. وهو لا يثبت أمر شراء منفردًا، وقد يشمل تسويات أو مرتجعات.",
    "فرصة المبيعات أو الربح غير المحققة هي قراءة حسابية مبنية على حركة الشهر السابق فقط عندما يظهر رصيد صفري وحركة صفرية في الشهر التالي؛ وليست خسارة محاسبية مؤكدة أو تنبؤًا.",
  ];

  if (!comparable) dataGaps.push("تحتاج لوحة وتيرة الدخول والخروج إلى ملفين شهريين أو أكثر؛ اللقطة الحالية تعرض فقط قيمة المخزون ومؤشرات التركيز.");

  const unreplenishedItems: UnreplenishedFocusItem[] = [];
  const months = periods.map<InventoryFlowMonth>((period, index) => {
    const previous = periods[index - 1];
    const openingStock = previous ? sumKnown(movement.items.map((item) => periodStock(item, previous))) : undefined;
    const closingStock = sumKnown(movement.items.map((item) => periodStock(item, period)));
    const salesValue = sumKnown(movement.items.map((item) => periodSales(item, period)));
    const outboundUnits = sumKnown(movement.items.map((item) => periodQuantity(item, period)));
    const zeroBalanceItems = movement.items.filter((item) => {
      const stock = periodStock(item, period);
      return stock !== undefined && stock <= 0;
    }).length;

    let inferredReplenishmentUnits: number | undefined;
    let unreplenishedOpportunitySales: number | undefined;
    let unreplenishedOpportunityGrossProfit: number | undefined;
    if (previous) {
      inferredReplenishmentUnits = sumKnown(movement.items.map((item) => {
        const opening = periodStock(item, previous);
        const closing = periodStock(item, period);
        const outgoing = periodQuantity(item, period);
        return opening !== undefined && closing !== undefined && outgoing !== undefined ? Math.max(0, closing + outgoing - opening) : undefined;
      }));

      const periodFocus = movement.items.flatMap((item) => {
        const historicalDemand = periodQuantity(item, previous);
        const historicalSales = periodSales(item, previous);
        const closing = periodStock(item, period);
        const currentQuantity = periodQuantity(item, period);
        const currentSales = periodSales(item, period);
        if (historicalDemand === undefined || historicalDemand <= 0 || closing === undefined || closing > 0) return [];
        // تكفي أي حركة حالية موثقة لاستبعاد الصنف من «عدم التوفر»؛ فلا نجمع بين خروج فعلي وفرصة ضائعة.
        if ((currentQuantity !== undefined && currentQuantity !== 0) || (currentSales !== undefined && currentSales !== 0)) return [];
        const inferred = Math.max(0, closing + (currentQuantity ?? 0) - (periodStock(item, previous) ?? 0));
        if (inferred > 0) return [];
        const opportunitySales = historicalSales !== undefined && historicalSales > 0
          ? historicalSales
          : item.publicPrice !== undefined ? historicalDemand * item.publicPrice : undefined;
        const opportunityGrossProfit = item.publicPrice !== undefined && item.purchasePrice !== undefined
          ? historicalDemand * Math.max(0, item.publicPrice - item.purchasePrice)
          : undefined;
        unreplenishedItems.push({ ...item, periodLabel: period.label, previousPeriodLabel: previous.label, historicalDemand, closingStock: closing, inferredReplenishmentUnits: inferred, opportunitySales, opportunityGrossProfit });
        return [{ opportunitySales, opportunityGrossProfit }];
      });
      unreplenishedOpportunitySales = sumKnown(periodFocus.map((item) => item.opportunitySales));
      unreplenishedOpportunityGrossProfit = sumKnown(periodFocus.map((item) => item.opportunityGrossProfit));
    }
    return { key: period.key, label: period.label, openingStock, closingStock, salesValue, outboundUnits, inferredReplenishmentUnits, zeroBalanceItems, unreplenishedOpportunitySales, unreplenishedOpportunityGrossProfit };
  });

  unreplenishedItems.sort((a, b) => (b.opportunitySales ?? b.historicalDemand) - (a.opportunitySales ?? a.historicalDemand));
  const inferredReplenishmentUnits = sumKnown(months.map((month) => month.inferredReplenishmentUnits));
  const outboundUnits = sumKnown(months.map((month) => month.outboundUnits));
  const unreplenishedOpportunitySales = sumKnown(months.map((month) => month.unreplenishedOpportunitySales));
  const unreplenishedOpportunityGrossProfit = sumKnown(months.map((month) => month.unreplenishedOpportunityGrossProfit));

  return {
    available: movement.available,
    comparable,
    months,
    unreplenishedItems,
    focusItems: movement.coverageGaps.filter((item) => item.priority === "عاجل" || item.priority === "مرتفع"),
    dataGaps,
    notes,
    metrics: {
      currentStockPurchaseValue,
      currentStockPublicValue,
      currentStockPotentialGrossProfit,
      zeroMovementPurchaseValue: movement.metrics.knownZeroMovementPurchaseValue,
      zeroMovementPublicValue: movement.metrics.knownZeroMovementPublicValue,
      zeroMovementPotentialGrossProfit: movement.metrics.knownZeroMovementPotentialProfit,
      currentZeroBalanceCount: currentPeriod ? movement.items.filter((item) => {
        const currentStock = periodStock(item, currentPeriod) ?? item.stock;
        return currentStock !== undefined && currentStock <= 0;
      }).length : movement.metrics.zeroBalanceCount,
      highPriorityCount,
      inferredReplenishmentUnits,
      outboundUnits,
      unreplenishedOpportunitySales,
      unreplenishedOpportunityGrossProfit,
    },
  };
}
