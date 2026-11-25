"""Reconcile the explicit collection roots and hospital subjects in the Vinmec plan."""
import argparse
from collections import Counter
import json
import sqlite3
from urllib.parse import quote

from audit_catalog_search_keywords import DB, ROOT, encode
from check_catalog_hashtags import get_page, normalized_hashtags, proof_hits
from extract_project_sources import read_book

PLAN_ID = "1Ttwd8vNxrF249JvFJOfrBZALD8cMXRwe"
PLAN_URL = f"https://docs.google.com/spreadsheets/d/{PLAN_ID}/edit?gid=300369525"
WORKBOOK = ROOT / "plan-refresh" / "public-plans" / f"{PLAN_ID}.xlsx"
OBSERVATIONS = ROOT / "plan-refresh" / "vinmec-hashtag-observations.json"
AUDIT_ID = "2026-11-19-vinmec-collection"
HOSPITAL_SHEET = "Từ khóa bệnh viện"
SPECIALTIES = {"Thai Sản", "IVF", "Cơ Xương Khớp", "Tiêu Hóa", "Tim Mạch", "Ung Bướu"}

# Select one actual plan phrase per hospital. Column I in the first block
# contains two named hospitals. K22:K26 repeats Nam Học under the 108 header.
HOSPITAL_CELLS = (
    "C3", "E3", "G3", "I3", "I5", "K3", "M7",
    "A22", "C26", "E22", "G22", "I24", "K27", "M23",
    "A36", "C37", "E36", "G34", "I34",
)
TAG_TOPICS = {
    "C": ("C3", {"tamanhhospital", "benhvientamanh", "benhviendakhoatamanh", "bvtamanh"}),
    "E": ("E3", {"hongngochospital", "benhvienhongngoc", "benhviendakhoahongngoc", "bvhongngoc"}),
    "K": ("K3", {"benhvienhoanmy", "bvhoanmy", "hoanmyhospital", "hoanmysaigon", "hoanmydanang", "hoanmythuduc", "hoanmybinhduong"}),
    "M": ("M7", {"fvhospital", "benhvienfv", "benhvienphapviet"}),
}


def value(row, column):
    return " ".join(row.get(column, {}).get("text", "").split())


def read_plan():
    rows = []
    tags = {}
    for sheet in read_book(WORKBOOK, (SPECIALTIES | {HOSPITAL_SHEET}).__contains__):
        name = sheet["name"]
        if name in SPECIALTIES:
            for row in sheet["rows"].values():
                if value(row, "B") != "L1-Core" or value(row, "E") or value(row, "G") != "Collection":
                    continue
                keyword = value(row, "C")
                rows.append((keyword, name, row["C"]["ref"], keyword, "L1-Core", None))
            continue
        cells = {cell["ref"]: cell["text"].strip() for row in sheet["rows"].values() for cell in row.values()}
        for ref in HOSPITAL_CELLS:
            keyword = cells[ref]
            rows.append((keyword, name, ref, keyword, "Competitor", None))
        for n in range(3, 17):
            row = sheet["rows"].get(n, {})
            for col, (ref, anchors) in TAG_TOPICS.items():
                for keyword in normalized_hashtags(value(row, col)):
                    tags[keyword.casefold()] = (keyword, row[col]["ref"], cells[ref], sorted(anchors))
    assert {name for _, name, _, _, layer, _ in rows if layer == "L1-Core"} == SPECIALTIES
    return rows, tags


def assess_tags(tags):
    observations = json.loads(OBSERVATIONS.read_text(encoding="utf8"))
    records = []
    for key, (keyword, ref, subject, anchors) in tags.items():
        row = observations[key]
        results = row.get("results", [])
        matches = proof_hits({"anchors": anchors}, results, {})
        valid = row["status"] == "OK" and len(matches) >= 3 and len(matches) * 10 >= len(results) * 7
        print(encode({"tag":keyword,"status":row["status"],"matches":len(matches),"sample_size":len(results),
                      "accepted":valid,"sample":[result["title"] for result in results[:4]]}))
        if valid:
            evidence = {"url":row["url"],"platform":"YouTube","checked_at":row["checked_at"],
                        "matched_count":len(matches),"sample_size":len(results),
                        "matched_examples":[{**result,"url":"https://www.youtube.com/watch?v="+result["video_id"]}
                                            for result in matches[:5]]}
            records.append((keyword, HOSPITAL_SHEET, ref, subject, "Hashtag", evidence))
    return records


def apply(db, records):
    before = dict(db.execute("SELECT Level,count(*) FROM search_queue WHERE ProjectName='Vinmec' GROUP BY Level"))
    status, = db.execute("SELECT plan_status FROM projects WHERE project_name='Vinmec'").fetchone()
    counts = Counter()
    with db:
        for keyword, sheet, ref, subject, layer, search in records:
            current = db.execute("SELECT keyword,status,level,evidence_json,originals_json,reasons_json FROM keywords "
                                 "WHERE project_name='Vinmec' AND keyword=? COLLATE NOCASE",(keyword,)).fetchone()
            if current and current[1:3] == ("READY", 2):
                continue
            prior_evidence, originals, reasons = (map(json.loads, current[3:]) if current else ([], [], []))
            origin = {"plan_url":PLAN_URL,"sheet":sheet,"cell":ref,"layer":layer,"keyword":keyword}
            reason = {
                "L1-Core":"Plan ghi Search_Intent=Collection, Parent_Keyword trống. Level 2 trong kho vì đây là chủ đề ngành.",
                "Competitor":"Tên bệnh viện đối thủ được ghi trong tab Từ khóa bệnh viện, dùng làm cụm search độc lập.",
                "Hashtag":"Hashtag nguyên dạng trong plan. Mẫu tìm riêng trên YouTube khớp bệnh viện đối thủ.",
            }[layer]
            if search:
                origin["hashtag_search"] = search
                prior_evidence.extend(f"YouTube: {example['title']} | {example['url']}" for example in search["matched_examples"])
                prior_evidence.append(search["url"])
            prior_evidence.append(f"Plan Vinmec — {sheet}!{ref}: {PLAN_URL}")
            binds = (status, encode([subject]), encode(prior_evidence), encode([*originals, origin]), encode([*reasons, reason]))
            if current:
                db.execute("UPDATE keywords SET level=2,status='READY',project_status=?,subjects_json=?,evidence_json=?,"
                           "originals_json=?,reasons_json=? WHERE project_name='Vinmec' AND keyword=?",(*binds,current[0]))
            else:
                db.execute("INSERT INTO keywords VALUES (?,'Vinmec',2,'READY',?,?,?,?,?)",(keyword,*binds))
            db.execute("INSERT INTO keyword_quality_audit VALUES (?,'Vinmec',?,?,'READY',?,2,NULL,?)",
                       (AUDIT_ID,current[0] if current else keyword,current[1] if current else None,
                        current[2] if current else None,reason))
            counts[layer] += 1
        assert not db.execute("PRAGMA foreign_key_check").fetchall()
        after = dict(db.execute("SELECT Level,count(*) FROM search_queue WHERE ProjectName='Vinmec' GROUP BY Level"))
    print(encode({"before":before,"after":after,"applied":dict(counts),
                  "all_project_levels":db.execute("SELECT Level,count(*) FROM search_queue GROUP BY Level").fetchall()}))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("fetch", "preview", "apply"))
    mode = parser.parse_args().mode
    records, tags = read_plan()
    if mode == "fetch":
        observations = {}
        for key, (tag, _, _, _) in tags.items():
            result = get_page(tag)
            observations[key] = result
            if result["status"] == "HTTP_429":
                raise RuntimeError("YouTube rate limited public requests")
        OBSERVATIONS.write_text(encode(observations)+"\n",encoding="utf8")
        return
    records.extend(assess_tags(tags))
    print(encode(Counter(layer for _,_,_,_,layer,_ in records)))
    if mode == "apply":
        with sqlite3.connect(DB.resolve().as_uri()+"?mode=rw", uri=True) as db:
            db.execute("PRAGMA foreign_keys=ON")
            db.execute("BEGIN IMMEDIATE")
            apply(db, records)


if __name__ == "__main__":
    main()
