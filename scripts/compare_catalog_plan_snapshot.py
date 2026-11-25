"""Compare exported Sheets by cell content and links, ignoring workbook packaging."""
import collections
import json
import re
from pathlib import Path
from zipfile import ZipFile

from extract_project_sources import read_book

BASE = Path("outputs/project-refresh-2026-11-10")
ROOT = Path("outputs/source-keyword-catalog-2026-11-19/plan-refresh")


def payload_signature(path):
    with ZipFile(path) as workbook:
        return {entry.filename: (entry.CRC, entry.file_size) for entry in workbook.infolist()
                if re.fullmatch(r"xl/(?:workbook\.xml|_rels/workbook\.xml\.rels|sharedStrings\.xml|worksheets/.+|comments.*\.xml)",
                                entry.filename)}


def cells(path):
    sheets = {}
    for sheet in read_book(path):
        entry = {}
        for row in sheet["rows"].values():
            for cell in row.values():
                val = tuple((cell.get(k) or "").strip() for k in ("text", "link", "note", "formula"))
                if val[3] and not any(val[1:3]):
                    # Dynamic recalculation alone is not an editable plan change.
                    val = ("", "", "", val[3])
                if any(val):
                    entry[cell["ref"]] = val
        sheets[sheet["name"]] = entry
    return sheets


def main():
    data = json.loads((ROOT / "master-documents.json").read_text(encoding="utf8"))
    fetched = {row["id"]: row["status"] for row in map(json.loads, (ROOT / "public-fetch.jsonl").read_text().splitlines())}
    reports = []
    for doc in data:
        doc_id = doc["id"]
        before = BASE / "plans" / (doc_id + ".xlsx")
        live = ROOT / "browser-plans" / (doc_id + ".xlsx")
        if not live.is_file():
            live = ROOT / "public-plans" / (doc_id + ".xlsx")
        row = {**doc, "old_file": str(before) if before.is_file() else None, "current_file": str(live) if live.is_file() else None}
        if not live.is_file():
            row["status"] = fetched[doc_id]
        elif not before.is_file():
            row["status"] = "NEWLY_ACCESSIBLE"
        elif payload_signature(before) == payload_signature(live):
            row["status"] = "IDENTICAL"
        else:
            old, new = cells(before), cells(live)
            changed = {}
            for name in sorted(old.keys() | new.keys()):
                a, b = old.get(name, {}), new.get(name, {})
                if a != b:
                    an, bn = collections.Counter(a.values()), collections.Counter(b.values())
                    changed[name] = {"old_cells": len(a), "new_cells": len(b), "new_values": sum((bn-an).values()),
                                     "removed_values": sum((an-bn).values()),
                                     "changed_cells": sum(a.get(k) != b.get(k) for k in a.keys() | b.keys())}
            row.update(status="CHANGED" if changed else "IDENTICAL", sheets=changed)
        reports.append(row)
    (ROOT / "plan-diff.json").write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf8")
    print(dict(collections.Counter(r["status"] for r in reports)))
    for row in reports:
        if row["status"] in {"CHANGED", "NEWLY_ACCESSIBLE"}:
            print(row["id"], [project for project, status in row["projects"]], row["status"],
                  [(k, v["new_values"], v["removed_values"]) for k, v in row.get("sheets", {}).items()])


if __name__ == "__main__":
    main()
