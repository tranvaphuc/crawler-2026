"""Collect read-only plan exports and independent keyword search evidence."""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import json
from pathlib import Path
import re
import sqlite3
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET
import zipfile

from audit_catalog_search_keywords import DB, ROOT
from extract_project_sources import read_book
import fetch_catalog_plan_snapshot as exports
from recheck_catalog_review import public_search

OUT = ROOT / "cross-platform-audit"
MASTER_ID = "1Z9YVa5AsbJhWvxq4As3j06ghPCXghjoTa-3O161mtEk"
BASELINE = ROOT / "plan-refresh/coverage-current/compared-plans.json"
DOCUMENT_PATH = re.compile(r"https://(?:docs|drive)\.google\.com/(spreadsheets|file)/d/([\w-]+)")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def replace_report(temp, path):
    for attempt in range(30):
        try:
            temp.replace(path)
            return
        except PermissionError:
            if attempt == 29:
                raise
            time.sleep(0.15)


def write_json(path, data):
    temp = path.with_suffix(path.suffix + ".partial")
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    replace_report(temp, path)


def master_documents(master):
    projects = {}
    documents = {}
    for sheet in read_book(master, lambda name: name in {"Main", "Sheet1"}):
        roster = sheet["name"] == "Main"
        for number, row in sorted(sheet["rows"].items()):
            if number < 2:
                continue
            project = row.get("A" if roster else "B", {}).get("text", "").strip()
            if not project:
                continue
            status = row.get("E", {}).get("text", "").strip().casefold() if roster else ""
            if status:
                projects.setdefault(project, status)
            cell = row.get("D" if roster else "F", {})
            for match in DOCUMENT_PATH.finditer("\n".join({v for v in (cell.get("link"), cell.get("text")) if v})):
                kind, doc_id = match.groups()
                item = documents.setdefault(doc_id, {"id": doc_id, "kind": kind, "url": match[0], "projects": {}})
                item["projects"][project] = status or item["projects"].get(project, "")
    for item in documents.values():
        item["projects"] = [[p, s or projects.get(p, "unknown")] for p, s in item["projects"].items()]
    return list(documents.values())


def plans():
    exports.ROOT = OUT
    (OUT / "public-plans").mkdir(exist_ok=True)
    _, status = exports.fetch({"id": MASTER_ID, "kind": "spreadsheets"})
    if status != "FETCHED":
        raise RuntimeError(f"Cannot refresh master: {status}")
    current = master_documents(OUT / "public-plans" / (MASTER_ID + ".xlsx"))
    old = {r["id"]: r for r in read_json(BASELINE)}
    if len(current) < len(old) * 0.8:
        raise RuntimeError(f"Unexpected master document coverage: {len(current)} of {len(old)} previous documents")
    write_json(OUT / "master-documents.json", current)
    with ThreadPoolExecutor(max_workers=4) as pool, (OUT / "plan-fetch.jsonl").open("w", encoding="utf-8") as log:
        results = Counter()
        for item, (doc_id, state) in zip(current, pool.map(exports.fetch, current)):
            baseline = old.get(doc_id, {})
            file = OUT / "public-plans" / (doc_id + ".xlsx")
            entry = {**item, "fetch_status": state, "current_file": str(file) if state == "FETCHED" else None,
                     "previous_file": baseline.get("current_file")}
            log.write(json.dumps(entry, ensure_ascii=False) + "\n")
            log.flush()
            results[state] += 1
            if sum(results.values()) % 25 == 0:
                print(dict(results), flush=True)
        print(dict(results), flush=True)


def google_news(keyword):
    query = {"q": keyword, "hl": "vi", "gl": "VN", "ceid": "VN:vi"}
    feed_url = "https://news.google.com/rss/search?" + urlencode(query)
    observed = {"keyword": keyword, "url": "https://news.google.com/search?" + urlencode(query),
                "platform": "Google News", "checked_at": datetime.now(timezone.utc).isoformat()}
    try:
        request = Request(feed_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/rss+xml"})
        with urlopen(request, timeout=15) as response:
            channel = ET.fromstring(response.read(2_000_000)).find("channel")
        if channel is None:
            return {**observed, "status": "NO_PUBLIC_DATA"}
        articles = []
        for item in channel.findall("item"):
            source = item.find("source")
            publisher_url = (source.get("url") or "") if source is not None else ""
            if re.search(r"(?:^|[./])fireant\.vn(?:[/:]|$)", publisher_url, re.I):
                continue
            articles.append({"title": item.findtext("title"), "url": item.findtext("link"),
                             "published_at": item.findtext("pubDate"), "publisher": item.findtext("source"),
                             "publisher_url": publisher_url})
        return {**observed, "status": "OK" if articles else "NO_ARTICLE_SAMPLE", "results": articles[:15]}
    except HTTPError as error:
        retry_after = error.headers.get('Retry-After') if error.headers else None
        return {**observed, "status": f"HTTP_{error.code}", **({"retry_after": retry_after} if retry_after else {})}
    except (URLError, TimeoutError, OSError, ET.ParseError) as error:
        return {**observed, "status": "READ_ERROR", "error": type(error).__name__}


def rate_limit_delay(rows):
    wait = 180
    for row in rows:
        header = row.get('retry_after')
        if not header:
            continue
        if header.isdigit():
            seconds = int(header)
        else:
            try:
                deadline = parsedate_to_datetime(header)
                if deadline.tzinfo is None:
                    deadline = deadline.replace(tzinfo=timezone.utc)
                seconds = (deadline - datetime.now(timezone.utc)).total_seconds()
            except (TypeError, ValueError, OverflowError):
                continue
        wait = max(wait, seconds)
    return wait


def search(platform, limit, query_file, wait_on_rate_limit=False):
    output = OUT / f"{platform}-search{'-followup' if query_file else ''}.jsonl"
    observed = {}
    if output.is_file():
        for line in output.read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            observed[row["keyword"]] = row["status"]
    if query_file:
        queries = list(dict.fromkeys(read_json(query_file)))
    else:
        with sqlite3.connect(DB.resolve().as_uri() + "?mode=ro", uri=True) as db:
            queries = [r[0] for r in db.execute("""SELECT Keyword,min(Level),max(Status='REVIEW')
                FROM keyword_catalog WHERE Status IN ('READY','REVIEW')
                GROUP BY Keyword COLLATE NOCASE ORDER BY 3 DESC,2,1 COLLATE NOCASE""")]
    targets = [q for q in queries if (platform != "news" or not q.startswith("#"))
               and observed.get(q) not in {"OK", "NO_VIDEO_SAMPLE", "NO_ARTICLE_SAMPLE"}]
    if limit is not None:
        targets = targets[:limit]
    lookup = google_news if platform == "news" else public_search
    with ThreadPoolExecutor(max_workers=2) as pool, output.open("a", encoding="utf-8") as handle:
        counts = Counter()
        throttle_streak=0
        start=0
        while start < len(targets):
            selected = targets[start:start+2]
            batch = list(pool.map(lookup, selected))
            for row in batch:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")
                counts[row["status"]] += 1
            handle.flush()
            if any(row['status'] in {'HTTP_403','HTTP_503'} for row in batch):
                break
            throttled = [row for row in batch if row['status']=='HTTP_429']
            if throttled:
                if not wait_on_rate_limit:
                    break
                throttle_streak = throttle_streak + 1 if len(throttled)==len(batch) else 1
                if throttle_streak>=4:
                    print(platform, 'stopped after repeated HTTP 429', flush=True)
                    break
                wait=rate_limit_delay(throttled)
                print(platform, f'HTTP 429, pausing {wait:.0f}s', dict(counts), flush=True)
                targets[start:start+len(selected)] = [row['keyword'] for row in throttled]
                time.sleep(wait)
                continue
            throttle_streak=0
            start += len(selected)
            if counts["READ_ERROR"] >= 8 and not counts["OK"]:
                break
            if sum(counts.values()) % 50 == 0:
                print(platform, dict(counts), flush=True)
            time.sleep(0.85)
        print(platform, dict(counts), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["plans", "news", "youtube"])
    parser.add_argument("--limit", type=int)
    parser.add_argument("--query-file", type=Path)
    parser.add_argument('--wait-on-rate-limit', action='store_true',
                        help='Resume read-only searches after the server cooldown on HTTP 429')
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    plans() if args.mode == "plans" else search(args.mode, args.limit, args.query_file, args.wait_on_rate_limit)


if __name__ == "__main__":
    main()
