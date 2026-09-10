import json
from collections import Counter
from pathlib import Path

import xlsxwriter


ROOT = Path("/Users/phuctran/Workspace/crawler-2026")
SOURCE = ROOT / "output/demo_zl_1_normalized.json"
OUTPUT_DIR = ROOT / "outputs/demo-zl-normalized"
OUTPUT = OUTPUT_DIR / "demo_zl_1_normalized.xlsx"

with SOURCE.open("r", encoding="utf-8") as handle:
    records = json.load(handle)

total = len(records)
gender_counts = Counter(row.get("Gender") for row in records)
relationship_counts = Counter(row.get("Relationship") for row in records)
present_gender = total - gender_counts[None]
present_birthday = sum(row.get("Birthday") is not None for row in records)
present_location = sum(row.get("Location") is not None for row in records)
present_relationship = total - relationship_counts[None]

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
workbook = xlsxwriter.Workbook(OUTPUT)
workbook.set_properties({
    "title": "Dữ liệu Zalo đã chuẩn hóa",
    "subject": "Gender, Birthday, Location và Relationship đã chuẩn hóa cho biểu đồ",
})

navy = "#0F4C5C"
dark = "#163A43"
light = "#E6F4F1"
border = "#B7CDD3"

summary = workbook.add_worksheet("Tổng quan")
data = workbook.add_worksheet("Dữ liệu")
summary.hide_gridlines(2)
data.hide_gridlines(2)

title_fmt = workbook.add_format({
    "bold": True, "font_color": "#FFFFFF", "bg_color": navy,
    "font_size": 18, "align": "center", "valign": "vcenter",
})
note_fmt = workbook.add_format({
    "italic": True, "font_color": "#335C67", "bg_color": light,
    "align": "center", "valign": "vcenter",
})
card_label_fmt = workbook.add_format({
    "bold": True, "font_color": dark, "bg_color": "#D9EAF0",
    "align": "center", "valign": "vcenter", "border": 1, "border_color": border,
})
card_value_fmt = workbook.add_format({
    "bold": True, "font_color": navy, "bg_color": "#F8FBFC",
    "font_size": 18, "num_format": "#,##0", "align": "center", "valign": "vcenter",
    "border": 1, "border_color": border,
})
section_fmt = workbook.add_format({
    "bold": True, "font_color": "#FFFFFF", "bg_color": navy,
    "align": "center", "valign": "vcenter", "border": 1, "border_color": "#083344",
})
text_fmt = workbook.add_format({"font_color": "#243B44", "bottom": 1, "bottom_color": "#DDE7EA"})
number_fmt = workbook.add_format({"num_format": "#,##0", "bottom": 1, "bottom_color": "#DDE7EA"})

summary.merge_range("A1:H2", "TỔNG QUAN DỮ LIỆU ZALO ĐÃ CHUẨN HÓA", title_fmt)
summary.set_row(0, 25)
summary.set_row(1, 25)
summary.merge_range(
    "A3:H3",
    "Nguồn: demo_zl_1_normalized.json • Gender và Relationship đã chuyển sang tiếng Anh • Birthday chỉ giữ năm",
    note_fmt,
)
summary.set_row(2, 24)

cards = [
    ("A5:B5", "A6:B7", "Tổng bản ghi", f"=COUNTA('Dữ liệu'!$A$2:$A${total + 1})", total),
    ("C5:D5", "C6:D7", "Có giới tính", f"=COUNTA('Dữ liệu'!$B$2:$B${total + 1})", present_gender),
    ("E5:F5", "E6:F7", "Có năm sinh", f"=COUNT('Dữ liệu'!$C$2:$C${total + 1})", present_birthday),
    ("G5:H5", "G6:H7", "Có địa điểm", f"=COUNTA('Dữ liệu'!$D$2:$D${total + 1})", present_location),
]
for label_range, value_range, label, formula, cached in cards:
    summary.merge_range(label_range, label, card_label_fmt)
    summary.merge_range(value_range, formula, card_value_fmt)
    top_left = value_range.split(":")[0]
    summary.write_formula(top_left, formula, card_value_fmt, cached)

summary.write_row("A10", ["Gender", "Số lượng"], section_fmt)
gender_rows = [("male", gender_counts["male"]), ("female", gender_counts["female"]), ("missing", gender_counts[None])]
for idx, (label, count) in enumerate(gender_rows, 10):
    summary.write(idx, 0, label, text_fmt)
    if label == "missing":
        formula = f"=COUNTBLANK('Dữ liệu'!$B$2:$B${total + 1})"
    else:
        formula = f'=COUNTIF(\'Dữ liệu\'!$B$2:$B${total + 1},A{idx + 1})'
    summary.write_formula(idx, 1, formula, number_fmt, count)

relationships = [
    "single", "married", "in a relationship", "engaged", "it's complicated",
    "divorced", "separated", "widowed", "in an open relationship",
    "in a civil union", "in a domestic partnership", "missing",
]
summary.write_row("D10", ["Relationship", "Số lượng"], section_fmt)
for idx, label in enumerate(relationships, 10):
    count = relationship_counts[None] if label == "missing" else relationship_counts[label]
    summary.write(idx, 3, label, text_fmt)
    if label == "missing":
        formula = f"=COUNTBLANK('Dữ liệu'!$E$2:$E${total + 1})"
    else:
        formula = f'=COUNTIF(\'Dữ liệu\'!$E$2:$E${total + 1},D{idx + 1})'
    summary.write_formula(idx, 4, formula, number_fmt, count)

summary.write_row("G10", ["Độ đầy đủ", "Số lượng"], section_fmt)
quality = [
    ("Có Relationship", f"=COUNTA('Dữ liệu'!$E$2:$E${total + 1})", present_relationship),
    ("Thiếu Location", f"=COUNTBLANK('Dữ liệu'!$D$2:$D${total + 1})", total - present_location),
    ("Thiếu Birthday", f"=COUNTBLANK('Dữ liệu'!$C$2:$C${total + 1})", total - present_birthday),
]
for idx, (label, formula, cached) in enumerate(quality, 10):
    summary.write(idx, 6, label, text_fmt)
    summary.write_formula(idx, 7, formula, number_fmt, cached)

summary.set_column("A:A", 18)
summary.set_column("B:B", 14)
summary.set_column("C:C", 4)
summary.set_column("D:D", 27)
summary.set_column("E:E", 14)
summary.set_column("F:F", 4)
summary.set_column("G:G", 22)
summary.set_column("H:H", 14)
summary.freeze_panes(3, 0)
summary.print_area("A1:H22")
summary.set_landscape()
summary.fit_to_pages(1, 1)

header_fmt = workbook.add_format({
    "bold": True, "font_color": "#FFFFFF", "bg_color": navy,
    "align": "center", "valign": "vcenter", "border": 1, "border_color": "#083344",
})
body_even = workbook.add_format({"bg_color": "#F3F8F9"})
body_odd = workbook.add_format({})
year_even = workbook.add_format({"bg_color": "#F3F8F9", "num_format": "0"})
year_odd = workbook.add_format({"num_format": "0"})
headers = ["UserId", "Gender", "Birthday", "Location", "Relationship"]
data.write_row(0, 0, headers, header_fmt)
data.set_row(0, 28)
for row_idx, record in enumerate(records, 1):
    base_fmt = body_even if row_idx % 2 == 0 else body_odd
    year_fmt = year_even if row_idx % 2 == 0 else year_odd
    data.write_string(row_idx, 0, str(record.get("UserId") or ""), base_fmt)
    data.write(row_idx, 1, record.get("Gender"), base_fmt)
    data.write(row_idx, 2, record.get("Birthday"), year_fmt)
    data.write(row_idx, 3, record.get("Location"), base_fmt)
    data.write(row_idx, 4, record.get("Relationship"), base_fmt)

data.set_column("A:A", 22)
data.set_column("B:B", 12)
data.set_column("C:C", 12)
data.set_column("D:D", 25)
data.set_column("E:E", 27)
data.freeze_panes(1, 0)
data.autofilter(0, 0, total, 4)
data.print_area("A1:E15")
data.set_landscape()
data.fit_to_pages(1, 1)

workbook.close()
print(json.dumps({"output": str(OUTPUT), "rows": total}, ensure_ascii=False))
