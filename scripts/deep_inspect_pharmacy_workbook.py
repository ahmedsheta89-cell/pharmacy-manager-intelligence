from __future__ import annotations

import json
import re
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from openpyxl.utils import get_column_letter


SOURCE = Path("/home/ubuntu/upload/6-8.xlsx")
OUTPUT = Path("/home/ubuntu/pharmacy-manager-intelligence/scripts/6-8_deep_inspection.json")

FIELD_PATTERNS: dict[str, tuple[str, ...]] = {
    "اسم_الصنف": ("اسم الصنف", "اسم", "الصنف", "الاسم", "الإسم", "item", "product"),
    "كود_الصنف": ("كود", "باركود", "code", "barcode", "رقم الصنف"),
    "سعر_الشراء": ("سعر الشراء", "شراء", "تكلفة", "تكلف", "cost", "purchase"),
    "سعر_الجمهور_او_البيع": ("سعر الجمهور", "سعر البيع", "سعر بيع", "الجمهور", "بيع", "public", "sale price"),
    "الرصيد": ("الرصيد", "رصيد", "المخزون", "stock", "balance"),
    "الكمية": ("الكمية", "كمية", "qty", "quantity"),
    "اجمالي_المبيعات": ("اجمالي س.بيع", "إجمالي س.بيع", "اجمالي البيع", "إجمالي البيع", "المبيعات", "sales"),
    "تاريخ": ("تاريخ", "date", "period", "الشهر"),
    "انتهاء": ("انتهاء", "صلاحي", "expiry", "expiration"),
    "الشركة": ("الشركة", "الشركه", "المورد", "company", "supplier"),
    "الوحدة": ("الوحدة", "وحده", "unit"),
}


def clean(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def json_value(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, float):
        return round(value, 6)
    return value


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def keyword_hits(value: Any) -> list[str]:
    text = clean(value).casefold()
    if not text:
        return []
    hits: list[str] = []
    for field, patterns in FIELD_PATTERNS.items():
        if any(pattern.casefold() in text for pattern in patterns):
            hits.append(field)
    return hits


def meaningful_cells(ws, max_rows: int = 35) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row, max_rows), values_only=False):
        cells = [
            {"cell": cell.coordinate, "value": json_value(cell.value)}
            for cell in row
            if clean(cell.value)
        ]
        if cells:
            rows.append({"row": row[0].row, "cells": cells})
    return rows


def column_profiles(ws, scan_rows: int = 5000) -> list[dict[str, Any]]:
    profiles: list[dict[str, Any]] = []
    max_row = min(ws.max_row, scan_rows)
    for col_idx in range(1, ws.max_column + 1):
        non_empty = 0
        numeric = 0
        dates = 0
        samples: list[Any] = []
        for row_idx in range(1, max_row + 1):
            value = ws.cell(row_idx, col_idx).value
            if not clean(value):
                continue
            non_empty += 1
            if is_number(value):
                numeric += 1
            if isinstance(value, (date, datetime)):
                dates += 1
            if len(samples) < 8:
                samples.append(json_value(value))
        if non_empty:
            profiles.append(
                {
                    "column": get_column_letter(col_idx),
                    "index": col_idx,
                    "non_empty": non_empty,
                    "numeric": numeric,
                    "date_values": dates,
                    "numeric_ratio": round(numeric / non_empty, 3),
                    "samples": samples,
                }
            )
    return profiles


def find_keyword_cells(ws, scan_rows: int = 5000) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row, scan_rows), values_only=False):
        for cell in row:
            hits = keyword_hits(cell.value)
            if hits:
                findings.append(
                    {
                        "cell": cell.coordinate,
                        "row": cell.row,
                        "column": get_column_letter(cell.column),
                        "value": json_value(cell.value),
                        "matches": hits,
                    }
                )
    return findings


def candidate_headers(ws, scan_rows: int = 40) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for row_idx in range(1, min(ws.max_row, scan_rows) + 1):
        matches: list[dict[str, Any]] = []
        text_count = 0
        for col_idx in range(1, ws.max_column + 1):
            value = ws.cell(row_idx, col_idx).value
            if clean(value) and not is_number(value):
                text_count += 1
            hits = keyword_hits(value)
            if hits:
                matches.append(
                    {
                        "column": get_column_letter(col_idx),
                        "index": col_idx,
                        "value": json_value(value),
                        "matches": hits,
                    }
                )
        if matches:
            candidates.append(
                {
                    "row": row_idx,
                    "keyword_score": len(matches),
                    "text_cells": text_count,
                    "matches": matches,
                }
            )
    return sorted(candidates, key=lambda item: (item["keyword_score"], item["text_cells"]), reverse=True)


def infer_row_shift(ws, header_row: int) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for col_idx in range(1, ws.max_column + 1):
        header = ws.cell(header_row, col_idx).value
        if not clean(header):
            continue
        following_values = [ws.cell(row_idx, col_idx).value for row_idx in range(header_row + 1, min(ws.max_row, header_row + 80) + 1)]
        numeric_ratio = sum(is_number(value) for value in following_values) / max(len(following_values), 1)
        sample = [json_value(value) for value in following_values if clean(value)][:5]
        result.append(
            {
                "header_column": get_column_letter(col_idx),
                "header_index": col_idx,
                "header": json_value(header),
                "field_matches": keyword_hits(header),
                "same_column_numeric_ratio": round(numeric_ratio, 3),
                "data_samples_below": sample,
            }
        )
    return result


def inspect_sheet(ws) -> dict[str, Any]:
    headers = candidate_headers(ws)
    best_header_row = headers[0]["row"] if headers else 1
    keyword_cells = find_keyword_cells(ws)
    keyword_counts = Counter(match for cell in keyword_cells for match in cell["matches"])
    hidden_columns = [
        get_column_letter(column_idx)
        for column_idx in range(1, ws.max_column + 1)
        if ws.column_dimensions[get_column_letter(column_idx)].hidden
    ]
    hidden_rows = [
        row_idx for row_idx in range(1, ws.max_row + 1)
        if ws.row_dimensions[row_idx].hidden
    ]

    return {
        "title": ws.title,
        "visibility": ws.sheet_state,
        "dimensions": {"max_row": ws.max_row, "max_column": ws.max_column},
        "hidden_columns": hidden_columns,
        "hidden_rows": hidden_rows,
        "merged_ranges": [str(merged) for merged in ws.merged_cells.ranges],
        "freeze_panes": str(ws.freeze_panes) if ws.freeze_panes else None,
        "first_meaningful_rows": meaningful_cells(ws),
        "candidate_header_rows": headers[:10],
        "chosen_header_row_for_profile": best_header_row,
        "header_to_data_profile": infer_row_shift(ws, best_header_row),
        "column_profiles": column_profiles(ws),
        "keyword_locations": keyword_cells,
        "keyword_counts": dict(keyword_counts),
    }


def main() -> None:
    workbook = load_workbook(SOURCE, data_only=False, read_only=False)
    report = {
        "source": SOURCE.name,
        "sheet_names": workbook.sheetnames,
        "sheets": [inspect_sheet(sheet) for sheet in workbook.worksheets],
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "sheets": [
            {
                "name": sheet["title"],
                "dimensions": sheet["dimensions"],
                "best_header_row": sheet["chosen_header_row_for_profile"],
                "keyword_counts": sheet["keyword_counts"],
            }
            for sheet in report["sheets"]
        ]
    }, ensure_ascii=False, indent=2))
    print(f"Saved deep inspection to {OUTPUT}")


if __name__ == "__main__":
    main()
