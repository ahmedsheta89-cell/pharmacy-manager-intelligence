from collections import Counter
from pathlib import Path
from openpyxl import load_workbook

workbook_path = Path('/home/ubuntu/upload/6-8.xlsx')
workbook = load_workbook(workbook_path, read_only=False, data_only=True)

for worksheet in workbook.worksheets:
    rows = list(worksheet.iter_rows(values_only=True))
    non_empty_rows = [row for row in rows if any(value not in (None, '') for value in row)]
    header = non_empty_rows[0]
    data = non_empty_rows[1:]
    print(f'SHEET={worksheet.title}')
    print(f'BOUNDS=min_row:{worksheet.min_row}, max_row:{worksheet.max_row}, min_col:{worksheet.min_column}, max_col:{worksheet.max_column}')
    print(f'ROWS={len(data)}')
    print(f'HEADER_COUNT={len(header)}')
    print('HEADERS_REPR=')
    for index, value in enumerate(header, start=1):
        print(f'  {index}: {value!r}')
    print('FIRST_THREE_ROWS_REPR=')
    for row in data[:3]:
        print(repr(row))
    print('COORDINATE_CHECK=')
    for row_index in range(1, 4):
        cells = [f'{cell.coordinate}={cell.value!r}' for cell in worksheet[row_index] if cell.value not in (None, '')]
        print('  ' + ' | '.join(cells))
    print('COLUMN_PROFILE=')
    for index, title in enumerate(header):
        values = [row[index] if index < len(row) else None for row in data]
        populated = [value for value in values if value not in (None, '')]
        types = Counter(type(value).__name__ for value in populated)
        samples = populated[:5]
        print(f'  {index + 1}: title={title!r}; filled={len(populated)}; types={dict(types)}; samples={samples!r}')
