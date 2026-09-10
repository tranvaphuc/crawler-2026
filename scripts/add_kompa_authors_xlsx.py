import json
import re
import shutil
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree


SOURCE = Path("/Users/phuctran/Downloads/OBRANDING_KOMPA_0509.xlsx")
ALIGNED = Path("outputs/kompa_profile_work/profiles_aligned.ndjson")
OUTPUT_DIR = Path("outputs/01a07164-8064-7313-962f-0d73887aa809")
OUTPUT = OUTPUT_DIR / "OBRANDING_KOMPA_0509_with_authors.xlsx"
TARGET_SHEET = "xl/worksheets/sheet2.xml"
NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
TAG = lambda name: f"{{{NS}}}{name}"
INVALID_XML_CHARS = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F]")


def inline_string_cell(reference, value, style):
    value = INVALID_XML_CHARS.sub("", value)
    cell = etree.Element(TAG("c"), r=reference, t="inlineStr", s=style)
    inline = etree.SubElement(cell, TAG("is"))
    text = etree.SubElement(inline, TAG("t"))
    if value[:1].isspace() or value[-1:].isspace():
        text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    text.text = value
    return cell


def rewrite_sheet(source_stream, target_stream):
    profiles = ALIGNED.open("r", encoding="utf-8")
    profile_count = 0
    with etree.xmlfile(target_stream, encoding="UTF-8") as writer:
        writer.write_declaration(standalone=True)
        root_context = None
        sheet_data_context = None
        depth = 0
        for event, element in etree.iterparse(source_stream, events=("start", "end"), huge_tree=True):
            if event == "start":
                depth += 1
                if depth == 1:
                    root_context = writer.element(element.tag, element.attrib, nsmap=element.nsmap)
                    root_context.__enter__()
                elif depth == 2 and element.tag == TAG("sheetData"):
                    sheet_data_context = writer.element(element.tag, element.attrib)
                    sheet_data_context.__enter__()
                continue

            if depth == 3 and element.tag == TAG("row"):
                row_number = int(element.get("r"))
                element.set("spans", "1:15")
                if row_number == 1:
                    author_id, author = "authorId", "author"
                    style = "1"
                else:
                    line = profiles.readline()
                    if not line:
                        raise RuntimeError(f"Missing aligned profile at worksheet row {row_number}")
                    record = json.loads(line)
                    author_id = str(record.get("authorId") or "")
                    author = str(record.get("author") or "")
                    style = "2"
                    profile_count += 1
                element.append(inline_string_cell(f"N{row_number}", author_id, style))
                element.append(inline_string_cell(f"O{row_number}", author, style))
                writer.write(element)
                element.clear()
                parent = element.getparent()
                while element.getprevious() is not None:
                    del parent[0]
            elif depth == 2:
                if element.tag == TAG("sheetData"):
                    sheet_data_context.__exit__(None, None, None)
                    sheet_data_context = None
                else:
                    if element.tag == TAG("dimension"):
                        element.set("ref", "A1:O693105")
                    elif element.tag == TAG("cols"):
                        etree.SubElement(element, TAG("col"), min="14", max="14", width="22", customWidth="1")
                        etree.SubElement(element, TAG("col"), min="15", max="15", width="28", customWidth="1")
                    elif element.tag == TAG("autoFilter"):
                        element.set("ref", "A1:O693105")
                    writer.write(element)
                    element.clear()
            elif depth == 1:
                root_context.__exit__(None, None, None)
                root_context = None
            depth -= 1

    extra = profiles.readline()
    profiles.close()
    if extra:
        raise RuntimeError("Aligned profile file has more rows than the Kompa worksheet")
    if profile_count != 693104:
        raise RuntimeError(f"Expected 693104 profiles, wrote {profile_count}")
    return profile_count


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with ZipFile(SOURCE, "r") as source_zip, ZipFile(OUTPUT, "w", compression=ZIP_DEFLATED, compresslevel=6) as target_zip:
        for info in source_zip.infolist():
            with source_zip.open(info, "r") as source_entry, target_zip.open(info, "w") as target_entry:
                if info.filename == TARGET_SHEET:
                    rows = rewrite_sheet(source_entry, target_entry)
                else:
                    shutil.copyfileobj(source_entry, target_entry, length=1024 * 1024)
    print({"output": str(OUTPUT.resolve()), "kompa_rows_enriched": rows})


if __name__ == "__main__":
    main()
