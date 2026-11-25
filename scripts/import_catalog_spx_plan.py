"""Keep the original SPX 2023 keyword cells and explicit source-table entries."""
import json
from collections import Counter
from hashlib import sha256
import re
import sqlite3

from audit_catalog_search_keywords import DB, encode
from build_source_keyword_catalog import url_key, numeric_url_id
from collect_catalog_platform_audit import OUT, write_json
from extract_project_sources import channel, read_book, urls

DOC = "18k_6ZHXCyj68rfqaVTuzi083m6o6ks7yJI9Fdu1ivww"
PLAN_URL = f"https://docs.google.com/spreadsheets/d/{DOC}"
PROJECT = "SPX"
SOCIAL = {"facebook", "tiktok", "youtube", "instagram", "linkedin", "threads"}


def observe():
    file = OUT / "public-plans" / (DOC + ".xlsx")
    sources, keywords = [], []
    for sheet in read_book(file, lambda s: s in {"Keywords 2023", "Sources - Brand 2023", "Relevant Sources 2023"}):
        name = sheet["name"]
        if name == "Keywords 2023":
            columns = {col: "main" if cell["text"].strip() == "Main" else "sub"
                       for col, cell in sheet["rows"][2].items() if re.match(r"^(Main|Sub)", cell["text"].strip())}
            for no, row in sheet["rows"].items():
                if no < 3:
                    continue
                for col, cell in row.items():
                    word = cell["text"].strip()
                    if col not in columns or not word:
                        continue
                    kind = "hashtag" if columns[col] == "main" and word.startswith("#") else columns[col]
                    origin = {"project": PROJECT, "scope": "plan 2023", "planUrl": PLAN_URL, "sheet": name,
                              "cell": cell["ref"], "value": word, "kind": kind}
                    keywords.append((PROJECT, kind, word, PLAN_URL, name, cell["ref"], encode(origin)))
            continue

        for no, row in sheet["rows"].items():
            if no < 3:
                continue
            for link_col, name_col, type_col in (("D","B","C"),) if name == "Sources - Brand 2023" else (("C","A","B"),("F","E","")):
                if link_col not in row:
                    continue
                cell = row[link_col]
                for link in urls(cell):
                    platform = channel(link).casefold()
                    if platform not in SOCIAL:
                        continue
                    label = row.get(name_col, {}).get("text", "").strip()
                    declared_type = row.get(type_col, {}).get("text", "").strip()
                    origin = {"project":PROJECT, "scope":"plan 2023", "planUrl":PLAN_URL, "sheet":name,
                              "cell":cell["ref"], "plan_name":label, "plan_type":declared_type, "original_link":link}
                    sources.append((platform, link, label, origin))
    return sources, keywords


def main():
    sources, keywords = observe()
    counts = Counter()
    with sqlite3.connect(DB.resolve().as_uri() + "?mode=rw", uri=True) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("BEGIN IMMEDIATE")
        known = {}
        for key, platform, link, originals in db.execute("SELECT source_key,channel,link,original_links_json FROM sources"):
            for original in [link, *json.loads(originals)]:
                if original and (normalized := url_key(platform, original)):
                    known.setdefault(normalized, set()).add(key)
        for platform, url, name, origin in sources:
            normalized = url_key(platform, url)
            if not normalized:
                continue
            found = known.get(normalized, set())
            if len(found) > 1:
                counts["source_url_collisions"] += 1
                continue
            key = next(iter(found), None)
            if not key:
                key = sha256(f"{platform}|{normalized[1]}".encode()).hexdigest()
                kind = "unknown"
                if platform == "facebook" and re.fullmatch(r"facebook\.com/groups/[\w.-]+", normalized[1]):
                    kind = "group_unknown"
                if platform == "youtube" and re.fullmatch(r"youtube\.com/(?:channel/UC[\w-]{22}|@[\w.%-]+)", normalized[1]):
                    kind = "channel"
                if platform in {"instagram", "threads", "tiktok"} and re.fullmatch(r"[^/]+/@?[\w.%]+", normalized[1]):
                    kind = "profile"
                if re.search(r"/(?:posts?|permalink|reels?|p|watch|videos?)(?:/|[?]|$)", normalized[1]):
                    kind = "content_reference"
                candidate = numeric_url_id(platform, normalized)
                db.execute("""INSERT INTO sources (source_key,channel,type,name,link,id,id_status,source_status,
                    identity_evidence_json,original_links_json,evidence_json)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)""", (key, platform, kind, name or None, url, candidate,
                    "URL_ONLY" if candidate else "UNRESOLVED", "PLAN_CONTENT_REFERENCE" if kind == "content_reference" else "PLAN_REFERENCE",
                    "[]", encode([url]), encode({"plan_names":[name] if name else [],"scope":"plan 2023"})))
                known[normalized] = {key}
                counts["sources_added"] += 1
            matched = db.execute("SELECT origins_json FROM source_projects WHERE source_key=? AND project_name=?", (key,PROJECT)).fetchone()
            provenance = json.loads(matched[0]) if matched else []
            if origin not in provenance:
                db.execute("INSERT OR REPLACE INTO source_projects VALUES (?,?,?)", (key,PROJECT,encode([*provenance,origin])))
                counts["source_origins_added"] += 1
                counts["project_links_added"] += not bool(matched)
        for record in keywords:
            project, _, _, url, sheet, cell, _ = record
            if not db.execute("SELECT 1 FROM es_keyword_cells WHERE project_name=? AND plan_url=? AND sheet=? AND cell=?", (project,url,sheet,cell)).fetchone():
                db.execute("INSERT INTO es_keyword_cells VALUES (?,?,?,?,?,?,?)", record)
                counts["raw_keyword_cells_added"] += 1
        assert db.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        assert not db.execute("PRAGMA foreign_key_check").fetchall()
    summary = {"plan_url":PLAN_URL,"source_rows_in_plan":len(sources),"keyword_cells_in_plan":len(keywords),**counts}
    if counts:
        write_json(OUT / "spx-plan-import.json", summary)
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
