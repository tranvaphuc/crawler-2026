"""Collect standalone public search evidence for the current keyword review."""
import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import gzip
import json
import re
import sqlite3
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from audit_catalog_search_keywords import DB, ROOT, compact, encode
from check_catalog_hashtags import blob, walk

OUT = ROOT / "keyword-review-followup"
SNAPSHOT = OUT / "review-input.json"
OBSERVATIONS = OUT / "search-results.jsonl"
DECISIONS = OUT / "decisions.tsv"
REPORT = OUT / "review-by-project.md"
AUDIT_ID = "2026-11-19-standalone-review"


def snapshot():
    OUT.mkdir(exist_ok=True)
    with sqlite3.connect(DB.resolve().as_uri()+"?mode=ro",uri=True) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute("""SELECT project_name,keyword,level,project_status,subjects_json,reasons_json
            FROM keywords WHERE status='REVIEW' ORDER BY project_status,project_name,keyword""").fetchall()
    SNAPSHOT.write_text(json.dumps([{"id":n,**dict(row)} for n,row in enumerate(rows,1)],
                                    ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print(f"Saved {len(rows)} review rows")


def public_search(keyword):
    query = "https://www.youtube.com/results?" + urlencode({"search_query":keyword,"hl":"vi","gl":"VN"})
    observed = {"keyword":keyword,"url":query,"checked_at":datetime.now(timezone.utc).isoformat(),"platform":"YouTube"}
    try:
        request=Request(query,headers={"User-Agent":"Mozilla/5.0","Accept-Language":"vi,en;q=0.8","Accept-Encoding":"gzip"})
        with urlopen(request,timeout=16) as response:
            if not response.url.startswith("https://www.youtube.com/results?"):
                return {**observed,"status":"REDIRECT"}
            raw=response.read(5_000_001)
            if response.headers.get("Content-Encoding")=="gzip":
                raw=gzip.decompress(raw)
        page=raw.decode("utf8","replace")
        start=re.search(r"(?:var\s+)?ytInitialData\s*=\s*(?=\{)",page)
        if not start:
            return {**observed,"status":"NO_PUBLIC_DATA"}
        data,_=json.JSONDecoder().raw_decode(page[start.end():])
        nodes=data.get("contents",{})
        items=[]
        correction=[]
        for element in walk(nodes):
            block=element.get("itemSectionRenderer") or element.get("richGridRenderer") or {}
            for result in block.get("contents",[]):
                result=result.get("richItemRenderer",{}).get("content",result)
                for field in ("showingResultsForRenderer","didYouMeanRenderer"):
                    if result.get(field):
                        correction.append(blob(result[field].get("correctedQuery")))
                item=result.get("videoRenderer") or result.get("compactVideoRenderer")
                if not item:
                    continue
                video=item.get("videoId","")
                if re.fullmatch(r"[\w-]{11}",video):
                    items.append({"title":blob(item.get("title")),"channel":blob(item.get("ownerText")),
                                  "snippet":blob(item.get("descriptionSnippet"))[:200],
                                  "url":"https://www.youtube.com/watch?v="+video})
        return {**observed,"status":"OK" if items else "NO_VIDEO_SAMPLE","results":items[:12],"correction":correction}
    except HTTPError as error:
        return {**observed,"status":f"HTTP_{error.code}"}
    except (URLError, TimeoutError, OSError, ValueError) as error:
        return {**observed,"status":"READ_ERROR","error":type(error).__name__}


def fetch(queries):
    if not queries:
        reviewed=json.loads(SNAPSHOT.read_text(encoding="utf8"))
        queries=[row["keyword"] for row in reviewed]
    existing={}
    if OBSERVATIONS.is_file():
        existing={i["keyword"]:i for i in map(json.loads, OBSERVATIONS.read_text(encoding="utf8").splitlines())}
    pending=[k for k in dict.fromkeys(queries)
             if k not in existing or existing[k]["status"] in {"READ_ERROR","HTTP_429","HTTP_503","NO_VIDEO_SAMPLE","NO_PUBLIC_DATA"}]
    total=len(pending)
    with OBSERVATIONS.open("a",encoding="utf8") as handle, ThreadPoolExecutor(max_workers=4) as executor:
        for offset in range(0,total,8):
            items=list(executor.map(public_search,pending[offset:offset+8]))
            for item in items:
                handle.write(encode(item)+"\n")
            handle.flush()
            if any(item["status"]=="HTTP_429" for item in items):
                print(f"Stopped at {min(offset+8,total)}/{total} due to HTTP 429",flush=True)
                break
            print(f"Checked {min(offset+8,total)}/{total} standalone searches",flush=True)
            time.sleep(0.5)


def decisions():
    batch = json.loads(SNAPSHOT.read_text(encoding="utf8"))
    observations = {r["keyword"]:r for r in map(json.loads,OBSERVATIONS.read_text(encoding="utf8").splitlines())}
    by_id = {}
    for line in DECISIONS.read_text(encoding="utf8").splitlines():
        if not line or line.startswith("#"):
            continue
        number, status, replacement, ranks, authority, reason = line.split("\t")
        review_id = int(number)
        if review_id in by_id or status not in {"READY","REVIEW","REPLACE"} or bool(replacement) != (status=="REPLACE"):
            raise ValueError(f"Invalid decision at row {number}")
        by_id[review_id] = (status,replacement,ranks,authority,reason)
    if len(batch) != 104 or set(by_id) != {r["id"] for r in batch}:
        raise ValueError("Each of the original 104 rows needs exactly one decision")
    for row in batch:
        status, replacement, ranks, authority, reason = by_id[row["id"]]
        original = observations[row["keyword"]]
        proof = observations[replacement] if replacement else original
        indexes = [int(rank)-1 for rank in ranks.split(",")] if ranks else []
        results = proof.get("results",[])
        if any(i<0 or i>=len(results) for i in indexes):
            raise ValueError(f"Invalid example ranks for row {row['id']}")
        examples = [results[i] for i in indexes]
        if status!="REVIEW" and not (examples or authority):
            raise ValueError(f"Missing supporting result for row {row['id']}")
        yield {**row,"decision":status,"replacement":replacement or None,"reason":reason,
               "authority":authority or None,"original_search":original["url"],"search":proof["url"],
               "search_status":proof["status"],"checked_at":proof["checked_at"],"examples":examples}


def labels(row):
    if row["decision"] == "REPLACE":
        return "OUT_OF_SCOPE" if row["id"]==25 else "ALIAS"
    return row["decision"]


def write_changes(db, reviewed):
    count = Counter()
    for row in reviewed:
        project, keyword = row["project_name"], row["keyword"]
        if db.execute("SELECT 1 FROM keyword_quality_audit WHERE audit_id=? AND project_name=? AND keyword=?",
                      (AUDIT_ID,project,keyword)).fetchone():
            continue
        current = db.execute("""SELECT level,status,project_status,subjects_json,evidence_json,originals_json,reasons_json
            FROM keywords WHERE project_name=? AND keyword=?""", (project,keyword)).fetchone()
        if not current or current[:3] != (row["level"],"REVIEW",row["project_status"]):
            raise RuntimeError(f"Review row changed since snapshot: {project} / {keyword}")
        level, before, plan_status, subjects, old_evidence, old_originals, old_reasons = current
        evidence = [f"YouTube standalone search ({row['search_status']}): {row['search']}"]
        evidence.extend(f"YouTube: {example['title']} | {example['url']}" for example in row["examples"])
        if row["authority"]:
            evidence.append(f"Web: {row['authority']}")
        activity = {"method":AUDIT_ID,"original_keyword":keyword,"prior_search_url":row["original_search"],
                    "checked_at":row["checked_at"],"status":row["decision"],"query":row["replacement"] or keyword,
                    "search_url":row["search"],"sample_status":row["search_status"],"selected_examples":row["examples"],
                    "web_result":row["authority"],"reason":row["reason"]}
        history = encode([*json.loads(old_originals),activity])
        reasons = encode([*json.loads(old_reasons),row["reason"]])
        next_status = labels(row)
        db.execute("""UPDATE keywords SET status=?,evidence_json=?,originals_json=?,reasons_json=?
            WHERE project_name=? AND keyword=?""",
            (next_status,encode([*json.loads(old_evidence),*evidence]),history,reasons,project,keyword))
        if replacement := row["replacement"]:
            if db.execute("SELECT 1 FROM keywords WHERE project_name=? AND keyword=? COLLATE NOCASE",
                          (project,replacement)).fetchone():
                raise RuntimeError(f"Replacement already present: {project} / {replacement}")
            db.execute("INSERT INTO keywords VALUES (?,?,?,'READY',?,?,?,?,?)",
                       (replacement,project,level,plan_status,subjects,encode(evidence),history,reasons))
        db.execute("INSERT INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)",
                   (AUDIT_ID,project,keyword,before,next_status,level,level,row["replacement"],row["reason"]))
        count[row["decision"]] += 1
    ready = db.execute("SELECT ProjectName,Keyword FROM search_queue").fetchall()
    keys = {(project,word.casefold() if word.startswith("#") else compact(word),word.startswith("#"))
            for project,word in ready}
    if len(keys)!=len(ready) or db.execute("PRAGMA foreign_key_check").fetchall():
        raise RuntimeError("Duplicate keyword or foreign key violation")
    return count


def write_report(reviewed, totals):
    groups = defaultdict(list)
    for row in reviewed:
        groups[row["project_name"]].append(row)
    states = Counter(r["decision"] for r in reviewed)
    lines = [
        "# Kết quả rà 104 dòng REVIEW", "",
        f"Đã đưa {states['READY']+states['REPLACE']} dòng vào hàng đợi, gồm {states['READY']} cụm giữ nguyên và "
        f"{states['REPLACE']} cụm đã thử lại với tên rõ hơn. Còn {states['REVIEW']} dòng REVIEW.",
        f"Hàng đợi sau cập nhật có {sum(totals.values())} dòng. Level 1 có {totals[1]} và Level 2 có {totals[2]}.", "",
        "Bằng chứng lấy từ kết quả tìm riêng trên YouTube và các trang web đối chiếu. Các dòng dùng bằng chứng web được ghi trong lý do.",
        "", "## Các dòng còn REVIEW", "",
    ]
    for project, rows in groups.items():
        pending = [r for r in rows if r["decision"]=="REVIEW"]
        if not pending:
            continue
        lines.extend([f"### {project}", ""])
        for row in pending:
            references = f"[Mẫu tìm riêng]({row['original_search']})"
            if row["authority"]:
                references += f" · [Nguồn đối chiếu]({row['authority']})"
            lines.append(f"- **{row['keyword']}** · Level {row['level']}. {row['reason']} {references}")
        lines.append("")
    lines.extend(["## Các dòng đã vào hàng đợi",""])
    for project, rows in groups.items():
        added = [r for r in rows if r["decision"]!="REVIEW"]
        if not added:
            continue
        lines.extend([f"### {project}",""])
        for row in added:
            target = row["replacement"] or row["keyword"]
            old = f" Từ dòng `{row['keyword']}`." if row["replacement"] else ""
            links = f"[Mẫu tìm riêng]({row['search']})"
            if row["examples"]:
                links += f" · [Kết quả khớp]({row['examples'][0]['url']})"
            if row["authority"]:
                links += f" · [Nguồn web]({row['authority']})"
            lines.append(f"- **{target}** · Level {row['level']}.{old} {row['reason']} {links}")
        lines.append("")
    temp = REPORT.with_suffix(".tmp")
    temp.write_text("\n".join(lines)+"\n",encoding="utf8")
    temp.replace(REPORT)


def apply_review():
    reviewed = list(decisions())
    with sqlite3.connect(DB.resolve().as_uri()+"?mode=rw",uri=True) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("BEGIN IMMEDIATE")
        written = write_changes(db,reviewed)
        totals = dict(db.execute("SELECT Level,count(*) FROM search_queue GROUP BY Level"))
        for row in reviewed:
            p, q = row["project_name"], row["keyword"]
            assert db.execute("SELECT Status FROM keyword_catalog WHERE ProjectName=? AND Keyword=?",(p,q)).fetchone()==(labels(row),)
            if target := row["replacement"]:
                assert db.execute("SELECT Level FROM search_queue WHERE ProjectName=? AND Keyword=?",(p,target)).fetchone()==(row["level"],)
        assert db.execute("PRAGMA quick_check").fetchone()==("ok",)
    write_report(reviewed,totals)
    print(encode({"checked":len(reviewed),"applied":dict(written),"queue_by_level":totals,"report":str(REPORT)}))


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("mode",choices=("snapshot","fetch","apply"))
    parser.add_argument("queries", nargs="*")
    args=parser.parse_args()
    if args.mode=="snapshot":
        snapshot()
    elif args.mode=="fetch":
        fetch(args.queries)
    else:
        apply_review()


if __name__=="__main__":
    main()
