from pathlib import Path
from openpyxl import load_workbook

workbook_path = Path('/home/ubuntu/upload/6-8.xlsx')
workbook = load_workbook(workbook_path, read_only=True, data_only=True)

print(f'FILE={workbook_path.name}')
print(f'SHEETS={len(workbook.sheetnames)}')

for worksheet in workbook.worksheets:
    print(f'\n--- SHEET: {worksheet.title} ---')
    print(f'DIMENSION={worksheet.max_row} rows x {worksheet.max_column} columns')
    for index, row in enumerate(worksheet.iter_rows(values_only=True), start=1):
        values = ['' if value is None else str(value) for value in row[:25]]
        print(' | '.join(values))
        if index >= 12:
            break
