import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

from lxml import etree


SOURCE = Path("/Users/phuctran/Downloads/OBRANDING_KOMPA_0509.xlsx")
OUTPUT = Path("outputs/01a07164-8064-7313-962f-0d73887aa809/OBRANDING_KOMPA_0509_with_authors.xlsx")
ALIGNED = Path("outputs/kompa_profile_work/profiles_aligned.ndjson")
SHEET = "xl/worksheets/sheet2.xml"
NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
TAG = lambda name: f"{{{NS}}}{name}"
TARGET_ROWS = {1, 2, 3, 346553, 693105}


def digest(stream):
    value = hashlib.sha256()
    while chunk := stream.read(1024 * 1024):
        value.update(chunk)
    return value.hexdigest()


with ZipFile(SOURCE) as source_zip, ZipFile(OUTPUT) as output_zip:
    assert source_zip.namelist() == output_zip.namelist()
    for name in source_zip.namelist():
        if name == SHEET:
            continue
        with source_zip.open(name) as source_entry, output_zip.open(name) as output_entry:
            assert digest(source_entry) == digest(output_entry), name

    expected_samples = {}
    with ALIGNED.open("r", encoding="utf-8") as aligned:
        for index, line in enumerate(aligned, 2):
            if index in TARGET_ROWS:
                expected_samples[index] = json.loads(line)

    row_count = 0
    author_id_blanks = 0
    author_blanks = 0
    samples = {}
    dimension = None
    with output_zip.open(SHEET) as sheet_stream:
        for event, element in etree.iterparse(sheet_stream, events=("end",), huge_tree=True):
            if element.tag == TAG("dimension"):
                dimension = element.get("ref")
            elif element.tag == TAG("row"):
                row_count += 1
                row_number = int(element.get("r"))
                cells = list(element)
                assert cells[-2].get("r") == f"N{row_number}"
                assert cells[-1].get("r") == f"O{row_number}"
                author_id = "".join(cells[-2].itertext())
                author = "".join(cells[-1].itertext())
                if row_number > 1:
                    author_id_blanks += int(not author_id)
                    author_blanks += int(not author)
                if row_number in TARGET_ROWS:
                    samples[row_number] = (author_id, author)
                element.clear()
                parent = element.getparent()
                while element.getprevious() is not None:
                    del parent[0]

assert dimension == "A1:O693105"
assert row_count == 693105
assert samples[1] == ("authorId", "author")
for row_number, record in expected_samples.items():
    assert samples[row_number] == (record["authorId"], record["author"])
assert author_id_blanks == 0
assert author_blanks == 0

print({
    "dimension": dimension,
    "rows": row_count - 1,
    "authorId_blanks": author_id_blanks,
    "author_blanks": author_blanks,
    "verified_rows": sorted(TARGET_ROWS),
    "samples": samples,
    "unchanged_entries_verified": 17,
})
