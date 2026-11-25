"""Extract reviewable additions from freshly exported plans, preserving cell provenance."""
import collections
import json
import re

from compare_catalog_plan_snapshot import ROOT, cells
from extract_project_sources import read_book, urls


def review():
    documents = json.loads((ROOT / "plan-diff.json").read_text(encoding="utf8"))
    result = []
    for doc in documents:
        if doc["status"] not in {"CHANGED", "NEWLY_ACCESSIBLE"}:
            continue
        previous = cells(doc["old_file"]) if doc["old_file"] else {}
        names = set(doc["sheets"]) if "sheets" in doc else None
        for sheet in read_book(doc["current_file"]):
            if names is not None and sheet["name"] not in names:
                continue
            old = previous.get(sheet["name"], {})
            seen_values = set(old.values())
            old_urls = {link for raw in old.values() for link in urls(dict(zip(("text", "link", "note", "formula"), raw)))}
            source_like = bool(re.search(r"source|nguồn|kênh|channel|fanpage|group|forum|youtube|tiktok|facebook|influencer|kol|koc|list paid|owned",
                                         sheet["name"], re.I))
            keyword_like = bool(re.search(r"keyword|\bkws?\b|main\s*key|từ[\s_-]*khóa|từ[\s_-]*khoá|topic|chủ đề",
                                          sheet["name"], re.I))
            changes = []
            for number, row in sorted(sheet["rows"].items()):
                context = {col: cell["text"] for col, cell in row.items() if cell.get("text")}
                for cell in row.values():
                    value = tuple((cell.get(key) or "").strip() for key in ("text", "link", "note", "formula"))
                    if value[3] and not any(value[1:3]):
                        value = ("", "", "", value[3])
                    if not any(value) or value in seen_values or old.get(cell["ref"]) == value:
                        continue
                    links = sorted(set(urls(cell)) - old_urls)
                    if not (links or (keyword_like and value[0])):
                        continue
                    changes.append({"cell": cell["ref"], "row": number, "text": value[0],
                                    "new_links": links, "row_context": context})
            if changes:
                result.append({"id": doc["id"], "url": doc["url"], "projects": doc["projects"], "sheet": sheet["name"],
                               "source_sheet": source_like, "keyword_sheet": keyword_like, "changes": changes})
    path = ROOT / "candidate-delta.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf8")
    for r in result:
        print([p[0] for p in r["projects"]], r["sheet"], len(r["changes"]),
              sum(bool(x["new_links"]) for x in r["changes"]), "keyword tab" if r["keyword_sheet"] else "")
    print("Candidate cells", sum(len(r["changes"]) for r in result))


if __name__ == "__main__":
    review()
