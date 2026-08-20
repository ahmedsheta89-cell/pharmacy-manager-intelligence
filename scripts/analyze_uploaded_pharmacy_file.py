from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


SOURCE = Path("/home/ubuntu/upload/6-8.xlsx")
OUTPUT = Path("/home/ubuntu/pharmacy-manager-intelligence/scripts/6-8_analysis.json")


def number(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def main() -> None:
    frame = pd.read_excel(SOURCE, sheet_name=0, header=0)
    frame = frame.dropna(how="all")
    frame.columns = [str(column).strip() for column in frame.columns]

    # في هذا التصدير، عناوين الأعمدة مزاحة خانة واحدة إلى اليمين:
    # قيمة العمود A تحمل عنوان B، وقيمة B تحمل عنوان C، وهكذا.
    sales_col = "الموظف"  # عنوانه الحقيقي: إجمالى س.بيع
    stock_col = "إجمالى س.بيع"  # عنوانه الحقيقي: الرصيد
    qty_col = "الوحدة"  # عنوانه الحقيقي: الكمية
    company_col = "المنشأ"  # عنوانه الحقيقي: الشركة
    item_col = "الشركة"  # عنوانه الحقيقي: الإسم
    code_col = "الإسم"  # عنوانه الحقيقي: الكود

    frame["_sales"] = number(frame[sales_col])
    frame["_quantity"] = number(frame[qty_col])
    frame["_stock"] = number(frame[stock_col])
    frame["_item"] = frame[item_col].fillna("").astype(str).str.strip()
    frame = frame[frame["_item"].ne("")].copy()

    zero_balance = frame[frame["_stock"].eq(0)].sort_values(["_sales", "_quantity"], ascending=False)
    negative_balance = frame[frame["_stock"].lt(0)].sort_values(["_sales", "_quantity"], ascending=False)
    fast_movers = frame[frame["_quantity"].gt(0)].sort_values(["_sales", "_quantity"], ascending=False)
    zero_with_sales = zero_balance[zero_balance["_sales"].gt(0)]

    columns = [item_col, code_col, company_col, "_sales", "_quantity", "_stock"]
    for col in columns:
        if col not in frame.columns:
            frame[col] = ""

    def records(data: pd.DataFrame, limit: int = 30) -> list[dict[str, object]]:
        result: list[dict[str, object]] = []
        for _, row in data.loc[:, columns].head(limit).iterrows():
            result.append({
                "الصنف": row[item_col],
                "الكود": row[code_col],
                "الشركة": row[company_col],
                "إجمالي_البيع": round(float(row["_sales"]), 2),
                "كمية_الحركة": round(float(row["_quantity"]), 2),
                "الرصيد_الحالي": round(float(row["_stock"]), 2),
            })
        return result

    report = {
        "source": SOURCE.name,
        "rows": int(len(frame)),
        "available_columns": list(frame.columns[:10]),
        "summary": {
            "zero_balance_count": int(len(zero_balance)),
            "missing_balance_count": int(frame["_stock"].isna().sum()),
            "negative_balance_count": int(len(negative_balance)),
            "zero_balance_sales_value": round(float(zero_balance["_sales"].sum()), 2),
            "zero_balance_units_moved": round(float(zero_balance["_quantity"].sum()), 2),
            "zero_balance_with_sales_count": int(len(zero_with_sales)),
            "zero_balance_with_sales_value": round(float(zero_with_sales["_sales"].sum()), 2),
            "fast_mover_count": int(len(fast_movers)),
        },
        "zero_balance_priority": records(zero_balance),
        "negative_balance_priority": records(negative_balance),
        "fast_movers": records(fast_movers),
        "limits": [
            "الملف يحتوي على شيت واحد فقط ولا يحتوي على عمود تاريخ؛ لذلك لا يمكن إثبات توقف صنف بين يونيو ويوليو وأغسطس من هذا التصدير وحده.",
            "لا تظهر أعمدة سعر الشراء أو سعر الجمهور أو هامش الربح؛ لذلك لا يمكن حسابها دون ملف أصناف أو تصدير يتضمنها.",
            "عمودا إجمالي البيع وكمية الحركة يشكلان لقطة مجمعة للفترة كما صدرت من البرنامج، ولا يجب تحويلهما إلى معدل شهري إلا بعد وجود فواصل شهرية موثقة.",
        ],
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print(f"Saved report to {OUTPUT}")


if __name__ == "__main__":
    main()
