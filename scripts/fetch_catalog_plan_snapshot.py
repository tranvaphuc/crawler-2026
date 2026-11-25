"""Fetch read-only Google Sheets exports for the current catalog comparison."""
import concurrent.futures
import json
import re
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path("outputs/source-keyword-catalog-2026-11-19/plan-refresh")


def fetch(document):
    doc_id = document["id"]
    if document["kind"] != "spreadsheets":
        return doc_id, "DRIVE_LINK_REQUIRES_REVIEW"
    if not re.fullmatch(r"[\w-]{15,}", doc_id):
        return doc_id, "INVALID_DOCUMENT_ID"
    file = ROOT / "public-plans" / (doc_id + ".xlsx")
    if file.is_file() and zipfile.is_zipfile(file):
        return doc_id, "FETCHED"
    url = f"https://docs.google.com/spreadsheets/d/{doc_id}/export?format=xlsx"
    for attempt in range(2):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request, timeout=35) as response:
                if urlparse(response.url).hostname == "accounts.google.com":
                    return doc_id, "AUTH_REQUIRED"
                data = response.read(75 * 1024 * 1024 + 1)
            if len(data) > 75 * 1024 * 1024:
                return doc_id, "EXPORT_SIZE_LIMIT"
            if not data.startswith(b"PK"):
                return doc_id, "NOT_XLSX"
            temp = file.with_suffix(".partial")
            temp.write_bytes(data)
            if not zipfile.is_zipfile(temp):
                return doc_id, "INVALID_XLSX"
            temp.replace(file)
            return doc_id, "FETCHED"
        except urllib.error.HTTPError as error:
            if error.code in {401, 403, 404, 410}:
                return doc_id, f"HTTP_{error.code}"
            if attempt == 1:
                return doc_id, f"HTTP_{error.code}"
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            if attempt == 1:
                return doc_id, type(error).__name__
        time.sleep(1.5)
    raise RuntimeError("Unreachable fetch state")


def main():
    (ROOT / "public-plans").mkdir(exist_ok=True)
    documents = json.loads((ROOT / "master-documents.json").read_text(encoding="utf8"))
    documents.sort(key=lambda d: all(status.casefold() == "stop" for _, status in d["projects"]))
    log = ROOT / "public-fetch.jsonl"
    with log.open("w", encoding="utf8") as handle, concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        work = {pool.submit(fetch, d): d for d in documents}
        for i, future in enumerate(concurrent.futures.as_completed(work), 1):
            doc_id, state = future.result()
            handle.write(json.dumps({"id": doc_id, "status": state}) + "\n")
            handle.flush()
            if i % 20 == 0 or i == len(work):
                print(f"Checked {i}/{len(work)} public exports", flush=True)


if __name__ == "__main__":
    sys.exit(main())
