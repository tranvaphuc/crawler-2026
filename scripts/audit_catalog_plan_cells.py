"""Account for archived plan cells and inventory newer public plan exports."""
from collections import Counter, defaultdict
import argparse
import json
from pathlib import Path
import re
import sqlite3
import unicodedata

from audit_catalog_search_keywords import compact, DB
from collect_catalog_platform_audit import OUT, write_json
from compare_catalog_plan_snapshot import cells, payload_signature
from extract_project_sources import read_book


def form(value):
    word = unicodedata.normalize("NFC", value or "").strip()
    return ("#" if word.startswith("#") else "") + compact(word)


def search_shape(value):
    value = value.strip().strip('"“”').strip()
    return (2 < len(value) <= 90 and bool(re.search(r"[^\W\d_]", value)) and
            not re.search(r'[\n;+|\[\]{}=<>]|://|\b(?:AND|OR|NOT)\b|\bsiteId:|#.+\s+#', value) and
            not re.match(r"^(?:n/a|#n/a|n/?a|note|ghi chú|keyword(?: list)?|từ khóa|main keyword|label|đối tượng)$", value, re.I))


def scan_archive(db):
    projects = dict(db.execute("SELECT project_name,plan_status FROM projects"))
    direct = defaultdict(list)
    trace = defaultdict(list)
    by_cell = defaultdict(list)
    for project, keyword, level, status, originals in db.execute(
        "SELECT project_name,keyword,level,status,originals_json FROM keywords"
    ):
        claim = {"keyword": keyword, "status": status, "level": level}
        direct[project, form(keyword)].append(claim)
        for origin in json.loads(originals):
            if not isinstance(origin, dict):
                continue
            for word in origin.get("originalKeywords", []):
                if isinstance(word, str):
                    trace[project, form(word)].append(claim)
            if origin.get("sheet") and origin.get("cell"):
                by_cell[project, origin["sheet"], origin["cell"]].append(claim)
            for path in origin.get("origins", []):
                if isinstance(path, str) and re.search(r"![A-Z]+\d+$", path):
                    sheet, ref = path.rsplit("!", 1)
                    by_cell[project, sheet, ref].append(claim)

    completion = Path("outputs/project-refresh-2026-11-10/completion")
    previous = json.loads((completion / "keyword-alias-dispositions.json").read_text(encoding="utf-8"))
    folded = defaultdict(list)
    for decision in previous:
        if decision["decision"] != "FOLDED_TO_VERIFIED_QUERY":
            continue
        project = decision["project"]
        covering = [claim for query in decision["finalQueries"] for claim in direct[project, form(query)]
                    if claim["status"] == "READY"]
        if covering:
            for value in decision["originalKeywords"]:
                folded[project, form(value)].extend(covering)

    counts = defaultdict(Counter)
    inventory = []
    candidates = defaultdict(list)
    for project, kind, raw, plan, sheet, cell, row_json in db.execute(
        "SELECT project_name,kind,raw_value,plan_url,sheet,cell,row_json FROM es_keyword_cells ORDER BY 1,5,6"
    ):
        word = (raw or "").strip()
        shape = search_shape(word)
        matches = direct.get((project, form(word)), [])
        references = trace.get((project, form(word)), []) or by_cell.get((project, sheet, cell), [])
        if kind == "exclude":
            state = "EXCLUDE_IN_PLAN"
        elif matches:
            state = "CATALOG_KEYWORD"
        elif kind == "sub":
            state = "ES_SUB_KEY"
        elif references:
            state = "CATALOG_REFERENCE"
        elif projects.get(project) == "stop":
            state = "PAUSED_PROJECT"
        elif not shape:
            state = "STRUCTURED_VALUE_OR_LABEL"
        elif (project, form(word)) in folded:
            state = "PREVIOUSLY_FOLDED_TO_QUERY"
            references = folded[project, form(word)]
        elif kind == "alias":
            state = "ALIAS_WITHOUT_STANDALONE_DECISION"
        else:
            state = "STANDALONE_NEEDS_TRIAGE"
        counts[project][state] += 1
        item = {"project": project, "kind": kind, "value": word, "plan_url": plan, "sheet": sheet, "cell": cell,
                "status": state, "catalog_matches": matches or references}
        inventory.append(item)
        if state == "STANDALONE_NEEDS_TRIAGE":
            row = json.loads(row_json)
            item.update({key: row[key] for key in ("subject", "roleOriginal", "parent_keyword") if row.get(key)})
            candidates[project, form(word)].append(item)

    with (OUT / "plan-keyword-cell-audit.jsonl").open("w", encoding="utf-8") as handle:
        for item in inventory:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")
    write_json(OUT / "plan-keyword-candidates.json", list(candidates.values()))
    return {"cells": len(inventory), "candidate_project_terms": len(candidates), "by_project": dict(counts),
            "by_status": dict(sum(counts.values(), Counter()))}


def scan_hashtags(db):
    catalog = {(p, form(q)): status for p,q,status in db.execute(
        "SELECT project_name,keyword,status FROM keywords WHERE keyword LIKE '#%'")}
    review = json.loads((OUT.parent / "hashtag-review.json").read_text(encoding="utf-8"))["records"]
    records = {}
    for row in review:
        tag = row.get("keyword") or row.get("hashtag")
        project = row.get("project") or row.get("project_name")
        if tag and project:
            records[project, form(tag)] = row.get("decision") or row.get("review") or row.get("status")
    rows = []
    for project, kind, raw, plan_url, sheet, cell in db.execute(
        "SELECT project_name,kind,raw_value,plan_url,sheet,cell FROM es_keyword_cells WHERE instr(raw_value,'#')>0"
    ):
        if kind == "exclude":
            continue
        for value in dict.fromkeys(re.findall(r"(?<!\w)#[^\W#][\w]{1,79}", raw, flags=re.UNICODE)):
            if value in {"#N", "#REF", "#VALUE", "#ERROR", "#DIV"}:
                continue
            status = catalog.get((project, form(value))) or records.get((project, form(value))) or "UNREVIEWED_IN_ARCHIVE"
            rows.append({"project": project, "keyword": value, "status": status,
                         "sheet": sheet, "cell": cell, "plan_url": plan_url})
    write_json(OUT / "plan-hashtag-cell-audit.json", rows)
    return {"cell_hashtags": len(rows), "by_status": dict(Counter(row["status"] for row in rows))}


def scan_documents(compare_contents):
    path = OUT / "plan-fetch.jsonl"
    documents = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    for row in documents:
        fresh = row["current_file"]
        previous = row["previous_file"]
        if not fresh:
            row["comparison"] = "ARCHIVED_ONLY" if previous else "NO_READABLE_COPY"
        elif not previous:
            row["comparison"] = "NEWLY_READABLE"
        else:
            row["comparison"] = "SAME_EXPORT_PAYLOAD" if payload_signature(previous) == payload_signature(fresh) else "PAYLOAD_DIFF_REVIEW"
            if compare_contents and row["comparison"] == "PAYLOAD_DIFF_REVIEW":
                before, after = cells(previous), cells(fresh)
                changed = [name for name in before.keys() | after.keys() if before.get(name) != after.get(name)]
                row["comparison"] = "CHANGED_CELLS" if changed else "SAME_CELL_CONTENT"
                if changed:
                    row["changed_sheets"] = sorted(changed)
    write_json(OUT / "plan-document-coverage.json", documents)
    return {"documents": len(documents), "fresh_exports": dict(Counter(r["fetch_status"] for r in documents)),
            "comparison": dict(Counter(r["comparison"] for r in documents))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--compare-contents", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    with sqlite3.connect(DB.resolve().as_uri() + "?mode=ro", uri=True) as db:
        coverage = scan_archive(db)
        hashtags = scan_hashtags(db)
    result = {"archive": coverage, "hashtags": hashtags, "fresh": scan_documents(args.compare_contents)}
    write_json(OUT / "plan-coverage-summary.json", result)
    print(json.dumps({"archive": {k: v for k, v in coverage.items() if k != "by_project"}, "fresh": result["fresh"]}))


if __name__ == "__main__":
    main()
