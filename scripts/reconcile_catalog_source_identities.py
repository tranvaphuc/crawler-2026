"""Reconcile catalog sources with typed, URL-matched platform observations."""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sqlite3
from urllib.parse import urlsplit

from audit_catalog_search_keywords import DB, ROOT
from build_source_keyword_catalog import url_key

AUDIT = "2026-11-19-platform-identity-recheck"
OUT = ROOT / "cross-platform-audit"
ARCHIVE = Path("outputs/source-audit-2026-10-22/sources-final.json")
SOCIAL = {"facebook", "threads", "youtube", "tiktok", "instagram", "linkedin"}


def aliases(channel, link):
    if not isinstance(link, str) or not (key := url_key(channel, link)):
        return set()
    host_path = key[1]
    if channel == "threads":
        host_path = re.sub(r"^threads\.net/", "threads.com/", host_path)
    if channel == "linkedin":
        host_path = re.sub(r"^[a-z]{2}\.linkedin\.com/", "linkedin.com/", host_path)
    if channel == "facebook":
        # The ID embedded in a root profile URL can be a Page's profile
        # alias. Only its trusted observation determines its actual type/ID.
        if not re.fullmatch(r"facebook\.com/(?:id/\d+|groups/[\w.%-]+|[\w.%-]+)", host_path):
            return set()
    return {host_path}


def typed_id(row):
    channel = row.get("channel", "").casefold()
    kind = row.get("type")
    identity = str(row.get("id") or "")
    evidence = row.get("identityEvidence") or ""
    if channel == "facebook":
        allowed = {
            "page": r"(?:delegate_page\.id|rootView\.props\.pageID)",
            "user": r"rootView\.props\.userID",
            "group": r"rootView\.props\.groupID",
        }
        typed_header = (kind in {"page", "user"} and
                        evidence == "Authenticated same-origin HTML primary profile/group query")
        return kind in allowed and identity.isdigit() and (typed_header or bool(re.search(allowed[kind], evidence)))
    if channel == "youtube":
        return kind == "channel" and bool(re.fullmatch(r"UC[\w-]{22}", identity)) and "channel metadata" in evidence
    if channel == "linkedin":
        return kind == "company" and identity.isdigit() and "organization URN" in evidence
    marker = {"threads": "profile root user_id", "instagram": "profile", "tiktok": "userInfo.user.id"}.get(channel)
    return bool(marker and kind == "profile" and identity.isdigit() and marker in evidence)


def load_observations():
    files = [(ARCHIVE, json.loads(ARCHIVE.read_text(encoding="utf-8")))]
    live_path = OUT / "source-probes.jsonl"
    if live_path.is_file():
        data = live_path.read_text(encoding="utf-8")
        if not data.endswith("\n"):
            data = data.rpartition("\n")[0]
        files.append((live_path, [json.loads(line) for line in data.splitlines()]))
    observations = defaultdict(list)
    for path, rows in files:
        for row in rows:
            channel = row.get("channel", "").casefold()
            if channel not in SOCIAL or row.get("status") != "live" or not typed_id(row):
                continue
            name = (row.get("name") or "").strip()
            if not name or name.casefold() in SOCIAL:
                continue
            # An owner link extracted from a post must not be matched to other
            # sources by guessing from the title or a partial handle.
            links = [row.get("url"), row.get("originalLink"), *row.get("inputUrls", [])]
            keys = set().union(*(aliases(channel, link) for link in links))
            verified = {"id": str(row["id"]), "type": row["type"], "name": name, "url": row.get("url"),
                        "checked_at": row.get("checkedAt"), "evidence": row["identityEvidence"],
                        "archive": path.as_posix(), "method": AUDIT, "live_checked": path == live_path,
                        "followers": row.get("followers"), "follower_precision": row.get("followerPrecision"),
                        "follower_kind": row.get("followerKind")}
            for key in keys:
                observations[channel, key].append(verified)
    return observations


def report_stats(db):
    return [dict(row) for row in db.execute("""SELECT channel, count(*) AS sources,
        sum(nullif(trim(name),'') IS NULL) AS missing_name, sum(nullif(trim(id),'') IS NULL) AS missing_id,
        sum(id_status IN ('ARCHIVE_VERIFIED','PLATFORM_VERIFIED')) AS verified_id,
        sum(follower IS NULL) AS missing_followers,
        sum(type='unknown') AS unknown_type, sum(type='group_unknown') AS unknown_group_privacy
        FROM sources WHERE channel IN ('facebook','threads','youtube','tiktok','instagram','linkedin') GROUP BY channel""")]


def reconcile(db, archive, apply):
    changes = []
    conflicts = []
    all_sources = db.execute("SELECT * FROM sources ORDER BY source_key").fetchall()
    for source in all_sources:
        channel = source["channel"]
        if channel not in SOCIAL or source["type"] == "content_reference":
            continue
        found = defaultdict(list)
        for link in [source["link"], *json.loads(source["original_links_json"])]:
            for key in aliases(channel, link):
                for candidate in archive[channel, key]:
                    found[candidate["id"], candidate["type"]].append(candidate)
        if not found:
            continue
        source_type = source["type"]
        comparable_type = "group" if source_type.startswith("group_") else source_type
        verified = source["id_status"] in {"ARCHIVE_VERIFIED", "PLATFORM_VERIFIED", "CONFLICT"}
        (identity, kind), matches = next(iter(found.items()))
        if len(found) != 1 or (verified and (source["id"] != identity or comparable_type not in {kind,"threads","unknown"})):
            conflict = {"source_key": source["source_key"], "channel": channel, "link": source["link"],
                        "existing_id": source["id"], "existing_type": source_type,
                        "candidates": [v[0] for v in found.values()]}
            conflicts.append(conflict)
            if apply and source["id_status"] != "CONFLICT":
                evidence = json.loads(source["identity_evidence_json"])
                db.execute("UPDATE sources SET id_status='CONFLICT',source_status='IDENTITY_REVIEW',identity_evidence_json=? WHERE source_key=?",
                           (json.dumps([*evidence, {"method":AUDIT,"conflict":conflict}], ensure_ascii=False),source["source_key"]))
            continue
        proof = max(matches, key=lambda row: row.get("checked_at") or "")
        target_type = source_type if kind == "group" and source_type.startswith("group_") else "group_unknown" if kind == "group" else kind
        fresh_metrics = (proof["live_checked"] and proof["followers"] is not None and
                         (not source["follower_as_of"] or proof["checked_at"] > source["follower_as_of"]))
        if verified and source["name"] and target_type == source_type and not fresh_metrics:
            continue
        change = {"source_key": source["source_key"], "channel": channel, "link": source["link"],
                  "previous_id": source["id"], "previous_type": source_type,
                  "verified_id": identity, "type": target_type, "name": proof["name"], "proof": proof}
        changes.append(change)
        if not apply:
            continue
        evidence = json.loads(source["identity_evidence_json"])
        identity_status = "PLATFORM_VERIFIED" if proof["live_checked"] else "ARCHIVE_VERIFIED"
        source_status = ("LIVE_VERIFIED" if proof["live_checked"] else "ARCHIVED") if source["source_status"] in {
            "NEEDS_RESOLVE", "PLAN_REFERENCE", "PLAN_REFRESH", "ARCHIVED"} else source["source_status"]
        db.execute("""UPDATE sources SET id=?,type=?,name=?,id_status=?,
                      source_status=?,identity_evidence_json=? WHERE source_key=?""",
                   (identity, target_type, proof["name"], identity_status, source_status,
                    json.dumps([*evidence, proof], ensure_ascii=False), source["source_key"]))
        if fresh_metrics:
            db.execute("""UPDATE sources SET follower=?,follower_kind=?,follower_precision=?,follower_as_of=?,
                          follower_source=?,follower_evidence=? WHERE source_key=?""",
                       (proof["followers"], proof["follower_kind"], proof["follower_precision"], proof["checked_at"],
                        proof["url"], proof["evidence"], source["source_key"]))
    return changes, conflicts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--prepare-probes", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    archive = load_observations()
    with sqlite3.connect(DB.resolve().as_uri() + ("?mode=rw" if args.apply else "?mode=ro"), uri=True) as db:
        db.row_factory = sqlite3.Row
        if args.prepare_probes:
            targets = [dict(row) for row in db.execute("""SELECT source_key,channel,link,type,id,
                EXISTS(SELECT 1 FROM source_projects p WHERE p.source_key=s.source_key) AS in_plan
                FROM sources s WHERE channel IN ('threads','youtube','tiktok','instagram','linkedin')
                AND type!='content_reference' AND (follower IS NULL OR id IS NULL OR name IS NULL)
                ORDER BY in_plan DESC,channel,lower(link)""")]
            path = OUT / "source-probe-targets.json"
            path.write_text(json.dumps(targets, ensure_ascii=False), encoding="utf-8")
            print(len(targets), path)
            return
        if args.apply:
            db.execute("PRAGMA foreign_keys=ON")
            db.execute("BEGIN IMMEDIATE")
        before = report_stats(db)
        changes, conflicts = reconcile(db, archive, args.apply)
        after = report_stats(db)
        if args.apply and (db.execute("PRAGMA quick_check").fetchone()[0] != "ok" or
                           db.execute("PRAGMA foreign_key_check").fetchall()):
            raise RuntimeError("Catalog integrity check failed")
    report = {"checked_at": datetime.now(timezone.utc).isoformat(), "applied": args.apply,
              "changes_by_channel": dict(Counter(row["channel"] for row in changes)),
              "conflicts_by_channel": dict(Counter(row["channel"] for row in conflicts)),
              "before": before, "after": after, "changes": changes, "conflicts": conflicts}
    path = OUT / ("source-identity-audit.json" if args.apply else "source-identity-preview.json")
    if args.apply and path.is_file():
        previous = json.loads(path.read_text(encoding="utf-8"))
        combined = {row["source_key"]:row for row in [*previous["changes"], *changes]}
        report["before"] = previous["before"]
        report["changes"] = list(combined.values())
        report["changes_by_channel"] = dict(Counter(row["channel"] for row in combined.values()))
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key not in {"changes", "conflicts"}}))


if __name__ == "__main__":
    main()
