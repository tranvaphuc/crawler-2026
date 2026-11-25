"""Apply the reviewed workbook delta to the local SQLite catalog in one transaction."""
import collections
import hashlib
import json
import re
import sqlite3
from datetime import datetime, timezone
from urllib.parse import urlsplit

from build_source_keyword_catalog import encode, numeric_url_id, privacy_from_plan, url_key
from compare_catalog_plan_snapshot import ROOT
from extract_project_sources import read_book

MASTER = "https://docs.google.com/spreadsheets/d/1Z9YVa5AsbJhWvxq4As3j06ghPCXghjoTa-3O161mtEk/edit?gid=1225318121#gid=1225318121"
DENIED = {
    "1C9POuBVia-bnij-4B1K0D-XBoMTtp_B_nOQGXHbBzAg": "BROWSER_HTTP_403",
    "1D02Dcv4f0oVqTyw_QuEvhcGj8ZhXSMjegan2nDgiDZQ": "BROWSER_HTTP_403",
    "1mktKZlOefI-QQS-y1l6GL4NB-DKor8CJ": "BROWSER_HTTP_403",
    "1-DCGa7Qvp3uB7LxDQw7E0VUa_G3OGNdj": "BROWSER_HTTP_403",
    "1G8JfySGNkJMhP6FM721tMAXD5fUgcJqeetd3B8S4JSA": "BROWSER_HTTP_403",
}


def input_json(name):
    return json.loads((ROOT / name).read_text(encoding="utf8"))


def master_rows():
    main = next(s for s in read_book(ROOT / "master.xlsx") if s["name"] == "Main")
    groups = collections.defaultdict(list)
    for number, cells in sorted(main["rows"].items()):
        if number < 2:
            continue
        def value(col, field="text"):
            return (cells.get(col, {}).get(field) or "").strip()
        if not value("A"):
            continue
        groups[value("A")].append(dict(row=number, project=value("A"), projectIds=value("B"), status=value("E"),
                                       note=value("F"), url=value("D", "link") or value("D")))
    return groups


def record_metadata(db, key, value):
    db.execute("INSERT OR REPLACE INTO catalog_metadata(key,value_json) VALUES (?,?)", (key, encode(value)))


def main():
    docs = input_json("plan-diff.json")
    chosen = input_json("reviewed-additions.json")
    checked = datetime.now(timezone.utc).isoformat()
    db = sqlite3.connect(ROOT.parent / "source-keyword-catalog.sqlite")
    counters = collections.Counter()
    master = master_rows()
    old_projects = {row[0] for row in db.execute("SELECT project_name FROM projects")}
    old_queue_count = db.execute("SELECT count(*) FROM search_queue").fetchone()[0]
    try:
        db.execute("PRAGMA foreign_keys=ON")
        with db:
            db.execute("""CREATE TABLE IF NOT EXISTS plan_refresh_documents (
                document_id TEXT PRIMARY KEY, plan_url TEXT NOT NULL, comparison_status TEXT NOT NULL,
                projects_json TEXT NOT NULL, changed_tabs_json TEXT NOT NULL, checked_at TEXT NOT NULL)""")
            db.execute("""CREATE TABLE IF NOT EXISTS plan_refresh_notes (
                project_name TEXT NOT NULL REFERENCES projects, issue TEXT NOT NULL, detail_json TEXT NOT NULL,
                PRIMARY KEY(project_name, issue))""")
            db.execute("""CREATE TABLE IF NOT EXISTS plan_refresh_content_links (
                project_name TEXT NOT NULL REFERENCES projects, link TEXT NOT NULL, plan_url TEXT NOT NULL,
                sheet TEXT NOT NULL, cell TEXT NOT NULL, PRIMARY KEY(project_name, link, plan_url, sheet, cell))""")
            for name, records in master.items():
                best = next((r for r in records if r["status"].casefold() != "stop"), records[0])
                db.execute("""INSERT INTO projects VALUES (?,?,?,?)
                    ON CONFLICT(project_name) DO UPDATE SET plan_status=excluded.plan_status,
                    plan_url=excluded.plan_url, rows_json=excluded.rows_json""",
                           (name, best["status"], best["url"], encode(records)))
                db.execute("UPDATE keywords SET project_status=? WHERE project_name=?", (best["status"], name))
                if name not in old_projects or name in chosen.get("new_project_issues", {}):
                    detail = chosen.get("new_project_issues", {}).get(name)
                    if detail:
                        db.execute("INSERT OR REPLACE INTO plan_refresh_notes VALUES (?,?,?)",
                                   (name, detail["issue"], encode({**detail, "master_rows": records, "master_url": MASTER})))
            for row in docs:
                state = DENIED.get(row["id"], row["status"])
                db.execute("INSERT OR REPLACE INTO plan_refresh_documents VALUES (?,?,?,?,?,?)",
                           (row["id"], row["url"], state, encode(row["projects"]), encode(row.get("sheets", {})), checked))
                if state not in {"CHANGED", "IDENTICAL", "NEWLY_ACCESSIBLE"}:
                    for project, previous_status in row["projects"]:
                        db.execute("""INSERT INTO plan_access_gaps
                            SELECT ?,?,?,? WHERE NOT EXISTS
                            (SELECT 1 FROM plan_access_gaps WHERE project_name=? AND plan_url=?)""",
                            (project, previous_status, row["url"], state, project, row["url"]))
                else:
                    db.execute("DELETE FROM plan_access_gaps WHERE instr(plan_url,?)>0", ("/d/"+row["id"],))
            for item in chosen["sources"]:
                channel, link = item["channel"], item["link"]
                key = url_key(channel, link)
                assert key, link
                host = (urlsplit(link).hostname or "").casefold()
                if host == "fireant.vn" or host.endswith(".fireant.vn"):
                    continue
                source_id = hashlib.sha256(encode(key).encode()).hexdigest()[:24]
                origins = item["origins"]
                group = channel == "facebook" and bool(re.fullmatch(r"facebook\.com/groups/[\w.-]+", key[1]))
                kind = {"youtube":"channel","instagram":"profile","tiktok":"profile","facebook":"unknown"}.get(channel, channel)
                privacy = privacy_from_plan(origins) if group else {}
                visibility = next(iter(privacy)) if len(privacy) == 1 else None
                if group:
                    kind = "group_" + (visibility or "unknown")
                native = numeric_url_id(channel, key)
                cursor = db.execute("""INSERT OR IGNORE INTO sources
                    (source_key,channel,type,name,link,id,id_status,group_privacy,group_privacy_status,
                     source_status,identity_evidence_json,original_links_json,evidence_json)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (source_id,channel,kind,item.get("name"),link,native,"URL_ONLY" if native else "UNRESOLVED",visibility,
                     "PLAN_LABEL" if visibility else "UNKNOWN" if group else None,"PLAN_REFRESH", "[]", encode([link]),
                     encode({"plan_refresh_origins":origins,"privacy_evidence":privacy})))
                counters["source_rows_added"] += cursor.rowcount
                for project in sorted({o["project"] for o in origins}):
                    new = [o for o in origins if o["project"] == project]
                    before = db.execute("SELECT origins_json FROM source_projects WHERE source_key=? AND project_name=?",
                                        (source_id, project)).fetchone()
                    previous = json.loads(before[0]) if before else []
                    merged = list({encode(o): o for o in [*previous, *new]}.values())
                    db.execute("INSERT OR REPLACE INTO source_projects VALUES (?,?,?)", (source_id, project, encode(merged)))
                    counters["source_project_links_added"] += before is None
            for item in chosen["keywords"]:
                project, value = item["project"], item["keyword"]
                assert item["level"] in {1, 2} and item["status"] in {"READY", "REVIEW"}
                assert not re.search(r'\+\s*["“]|^[#"]|\b(?:AND|OR|NOT)\b|[<>|=]', value)
                state = db.execute("SELECT plan_status FROM projects WHERE project_name=?", (project,)).fetchone()[0]
                cursor = db.execute("INSERT OR IGNORE INTO keywords VALUES (?,?,?,?,?,?,?,?,?)",
                    (value, project, item["level"], item["status"], state, encode([item["subject"]]),
                     encode(item.get("evidence", [])), encode(item["originals"]), encode(item.get("reasons", []))))
                counters["keyword_rows_added"] += cursor.rowcount
                if not cursor.rowcount:
                    before = db.execute("SELECT originals_json FROM keywords WHERE project_name=? AND keyword=?",
                                        (project, value)).fetchone()
                    old = json.loads(before[0])
                    combined = list({encode(v): v for v in [*old, *item["originals"]]}.values())
                    db.execute("UPDATE keywords SET originals_json=? WHERE project_name=? AND keyword=?",
                               (encode(combined), project, value))
                    counters["existing_keyword_sources_updated"] += len(combined) > len(old)
            for item in chosen.get("retired_keywords", []):
                existing = db.execute("SELECT status,reasons_json FROM keywords WHERE project_name=? AND keyword=?",
                                      (item["project"], item["keyword"])).fetchone()
                if existing and existing[0] == "READY":
                    db.execute("UPDATE keywords SET status='RETIRED',reasons_json=? WHERE project_name=? AND keyword=?",
                               (encode([*json.loads(existing[1]), item["reason"]]), item["project"], item["keyword"]))
                    counters["keywords_retired"] += 1
            for reference in chosen.get("content_references", []):
                cursor = db.execute("INSERT OR IGNORE INTO plan_refresh_content_links VALUES (?,?,?,?,?)",
                                    tuple(reference[k] for k in ("project","link","plan_url","sheet","cell")))
                counters["content_references_archived"] += cursor.rowcount
            for item in chosen.get("decisions", []):
                db.execute("""INSERT INTO keyword_decisions
                    SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS
                    (SELECT 1 FROM keyword_decisions WHERE project_name=? AND original_json=?)""",
                           (item["project"],item.get("subject"),item.get("original"),item.get("level"),
                            item["decision"],item["reason"],encode(item),item["project"],encode(item)))
            for item in chosen.get("raw_keyword_cells", []):
                db.execute("""INSERT INTO es_keyword_cells
                    SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS
                    (SELECT 1 FROM es_keyword_cells WHERE project_name=? AND sheet=? AND cell=? AND row_json=?)""",
                    (item["project"],item["kind"],item["text"],item["plan_url"],item["sheet"],item["cell"],encode(item),
                     item["project"],item["sheet"],item["cell"],encode(item)))
            accessible = sum(r["status"] in {"CHANGED","IDENTICAL","NEWLY_ACCESSIBLE"} for r in docs)
            result = dict(checked_at=checked, master_url=MASTER, child_plan_links=len(docs), child_plans_compared=accessible,
                          changed_child_plans=sum(r["status"] == "CHANGED" for r in docs),
                          newly_accessible_child_plans=sum(r["status"] == "NEWLY_ACCESSIBLE" for r in docs),
                          inaccessible_running_plans=[p for r in docs if not r["current_file"] for p,s in r["projects"] if s!="stop"],
                          new_projects=sorted(set(master)-old_projects), **counters)
            result["search_queue_before"] = old_queue_count
            result["search_queue_after"] = db.execute("SELECT count(*) FROM search_queue").fetchone()[0]
            result["search_queue_by_level"] = db.execute("SELECT Level,count(*) FROM search_queue GROUP BY Level").fetchall()
            result["master_running_rows_with_no_published_plan_link"] = list(chosen.get("new_project_issues", {}))
            record_metadata(db, "plan_refresh_2026-11-19", result)
            assert not db.execute("PRAGMA foreign_key_check").fetchall()
            assert db.execute("SELECT Keyword FROM search_queue WHERE ProjectName=? AND Level=1",
                              ("Bệnh Viện Quốc Tế Mỹ",)).fetchall() == [("AIH",)]
        assert db.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        (ROOT / "applied-summary.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf8")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        db.close()


if __name__ == "__main__":
    main()
