"""Build the local source and keyword catalog from the archived plan and KOL exports."""
import collections
import hashlib
import json
import re
import sqlite3
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

WORKSPACE = Path(__file__).resolve().parents[1]
PLAN = WORKSPACE / "outputs/project-refresh-2026-11-10"
PREVIOUS_PLAN = WORKSPACE / "outputs/project-sources-2026-10-21"
KOL = WORKSPACE / "outputs/nguoinoitieng-2026-11-18"
OUTPUT = WORKSPACE / "outputs/source-keyword-catalog-2026-11-19"
PLATFORMS = {"facebook", "instagram", "youtube", "tiktok"}


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def load(directory, name):
    return json.loads((directory / name).read_text(encoding="utf-8"))


def norm(value):
    value = unicodedata.normalize("NFKD", value.casefold()).replace("đ", "d")
    return re.sub(r"[^\w]+", "", "".join(c for c in value if not unicodedata.combining(c)))


def url_key(platform, url):
    try:
        parts = urlsplit(url.strip())
        host = (parts.hostname or "").lower().removeprefix("www.")
    except ValueError:
        return None
    if parts.scheme not in {"http", "https"} or not host or parts.username or parts.password:
        return None
    route = parts.path.rstrip("/") or "/"
    if platform == "facebook" and host in {"facebook.com", "m.facebook.com", "web.facebook.com", "fb.com", "fb.me"}:
        host = "facebook.com"
        route = route.lower()
        if route.startswith("/pg/"):
            route = route[3:]
        groups = re.fullmatch(r"/groups/([\w.-]+)/(?:about|members|people)", route)
        if groups:
            route = "/groups/" + groups[1]
        direct = re.fullmatch(r"/(?:people|pages)/[^/]+/(\d+)|/(\d+)", route)
        if direct:
            route = "/id/" + (direct[1] or direct[2])
        if route == "/profile.php":
            query = parse_qs(parts.query)
            ids = query.get("id", [])
            if len(ids) == 1 and ids[0].isdigit() and not {"fbid","story_fbid","comment_id"} & query.keys():
                route = "/id/" + ids[0]
            else:
                route += "?" + parts.query
        elif parts.query and (route.endswith(".php") or route == "/watch"):
            route += "?" + parts.query
    elif platform == "youtube":
        host = "youtube.com" if host == "m.youtube.com" else host
        route = re.sub(r"/(?:featured|videos|about|shorts)$", "", route)
        if len(route) > 1 and route.startswith("/@"):
            route = route.casefold()
        if parts.query and route in {"/watch", "/results", "/playlist"}:
            route += "?" + parts.query
    elif platform in {"instagram", "tiktok"}:
        if re.fullmatch(r"/@?[\w.]+", route):
            route = route.casefold()
    elif parts.query:
        route += "?" + parts.query
    return (platform, host + route)


def privacy_from_plan(origins):
    evidence = {}
    for origin in origins:
        sheet = unicodedata.normalize("NFC", origin.get("sheet", ""))
        if re.search(r"\b(?:public groups?|groups? public|nhóm công khai|group công khai)\b", sheet, re.I):
            evidence["public"] = sheet
        if re.search(r"\b(?:private groups?|groups? private|nhóm kín|group kín|nhóm riêng tư|group riêng tư)\b", sheet, re.I):
            evidence["private"] = sheet
    return evidence


def numeric_url_id(platform, key):
    route = key[1]
    pattern = {
        "facebook": r"facebook\.com/(?:id|groups)/(\d+)$",
        "youtube": r"youtube\.com/channel/(UC[\w-]{22})$",
    }.get(platform)
    match = re.fullmatch(pattern, route) if pattern else None
    return match[1] if match else None


def metric(number):
    number = re.sub(r"\s+", " ", number.strip()).casefold()
    m = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*(k|m|nghìn|ngàn|triệu|tỷ)", number)
    if m:
        multiplier = {"k": 1000, "nghìn": 1000, "ngàn": 1000, "m": 10**6, "triệu": 10**6, "tỷ": 10**9}
        return round(float(m[1].replace(",", ".")) * multiplier[m[2]]), "rounded"
    if re.fullmatch(r"\d+|\d{1,3}(?:[,. ]\d{3})+", number):
        return int(re.sub(r"\D", "", number)), "reported_integer"
    return None, None


DISPLAY_NUMBER = r"(?:\d{1,3}(?:[,. ]\d{3})+|\d+(?:[,.]\d+)?)(?:\s*(?:nghìn|ngàn|triệu|tỷ|[kKmM]))?"


def observed_followers(observation):
    if not observation["safe"] or observation["platform"] not in PLATFORMS:
        return None
    text = observation["metric_note"]
    if re.search("khác tên|wrong.subject|không khớp|sai chủ thể", text, re.I):
        return None
    found = list(re.finditer(rf"(?<![\d.,])({DISPLAY_NUMBER})\s+(followers?|người theo dõi|subscribers?|người đăng ký)\b", text, re.I))
    amounts = {metric(m[1]) for m in found} - {(None, None)}
    if len(amounts) != 1:
        return None
    value, precision = amounts.pop()
    return (value, precision, found[0][0], observation["checked_at"], observation["url"], "archived_platform_observation")


def biography_followers(profile, platform):
    # Require a subject-owned account in the sentence and one eligible account on this platform.
    names = {"facebook": r"Facebook|fanpage Facebook", "instagram": r"Instagram",
             "tiktok": r"Tik\s*Tok", "youtube": r"YouTube"}[platform]
    name = re.escape(profile["name"])
    if len(profile["name"]) < 3:
        return None
    pattern = rf"(?:trang|tài khoản|kênh|fanpage)\s+(?:{names})(?:\s+cá nhân)?\s+của\s+{name}\s+(?:(?:hiện|đã|hiện đang|đang)\s+)*(?:có|sở hữu|đạt|thu hút)\s+(?:(hơn|gần|khoảng|trên)\s+)?({DISPLAY_NUMBER})\s+(?:lượt\s+)?(?:theo dõi|người theo dõi|người đăng ký|lượt đăng ký|followers?|subscribers?)\b"
    for section in profile["sections"]:
        if not section["title"].startswith("Tiểu sử"):
            continue
        match = re.search(pattern, section["text"], re.I)
        if match:
            value, precision = metric(match[2])
            if value is not None:
                if match[1]:
                    precision = {"hơn": "lower_bound", "trên": "lower_bound"}.get(match[1].lower(), "approximate")
                # The timestamp dates the archive capture, not when this count was measured.
                return (value, precision, match[0], profile["fetched_at"], profile["source_url"], "archived_biography_claim")
    return None


def objects_in(value):
    stack = [value]
    while stack:
        value = stack.pop()
        if isinstance(value, dict):
            yield value
            stack.extend(value.values())
        elif isinstance(value, list):
            stack.extend(value)


def script_objects(text):
    for payload in re.finditer(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', text, re.S):
        try:
            yield from objects_in(json.loads(payload[1]))
        except (ValueError, RecursionError):
            continue


def observation_index():
    result = collections.defaultdict(list)

    def add(platform, urls, native, kind, name, evidence, checked_at, status, safe, metric_note, privacy=None):
        native = str(native) if native is not None else None
        record = dict(platform=platform, id=native, type=kind, name=name, evidence=evidence,
                      checked_at=checked_at, status=status, safe=safe, metric_note=metric_note, privacy=privacy,
                      url=next((url for url in urls if url), ""))
        for key in {url_key(platform, url) for url in urls if url} - {None}:
            result[key].append(record)
        if native and safe:
            canonical = {
                "facebook": f"https://www.facebook.com/{'groups/' if kind == 'group' else ''}{native}" if native.isdigit() else None,
                "youtube": f"https://www.youtube.com/channel/{native}" if kind == "channel" else None,
            }.get(platform)
            if canonical:
                key = url_key(platform, canonical)
                if record not in result[key]:
                    result[key].append(record)

    for file in ("project-source-inventory.json", "system-sources-before.json"):
        for row in load(PLAN, file):
            audit = row.get("audit") or {}
            evidence = audit.get("identityEvidence") or ""
            status = audit.get("status")
            note = str(audit.get("note") or "")
            safe = bool(row.get("nativeId") and evidence and
                        status in {"live", "IDENTITY_CONFIRMED", "RESOLVED"} and
                        evidence.upper() not in {"URL_ONLY", "PLAN"} and
                        not re.search(r"wrong.subject|khác tên|sai chủ thể|không khớp", evidence + " " + note, re.I))
            add(row["platform"], [row["url"]], row.get("nativeId"), row.get("type"), row.get("name"),
                evidence, audit.get("checkedAt"), status, safe, evidence + " " + note)
    verified_tiktok = {row["_id"]: row for row in load(PLAN, "completion/tiktok-owner-verified.json")}
    tiktok_metadata = {}
    for check in load(PLAN, "completion/source-checks.json"):
        owner = verified_tiktok.get(check["_id"])
        platform = check["platform"]
        url = check.get("inputUrl")
        group_id = re.search(r"^https?://(?:www\.|m\.)?facebook\.com/groups/(\d+)/?$", url or "") if platform == "facebook" else None
        insta = re.search(r"^https?://(?:www\.)?instagram\.com/([\w.]+)/?$", url or "") if platform == "instagram" else None
        if not (owner or group_id or insta) or not check.get("responseFile") or check.get("httpStatus") != 200:
            continue
        snapshot = WORKSPACE / Path(check["responseFile"])
        if not snapshot.is_file() or snapshot.stat().st_size < 3000:
            continue
        text = snapshot.read_text(encoding="utf-8")
        if group_id:
            choices = {}
            for obj in script_objects(text):
                if str(obj.get("id")) != group_id[1] or obj.get("__typename") != "Group" or not obj.get("name"):
                    continue
                privacy_info = obj.get("privacy_info") or {}
                title = (privacy_info.get("title") or privacy_info.get("label") or {}).get("text", "").casefold()
                if title in {"public", "public group", "nhóm công khai"}:
                    choices["public"] = obj["name"]
                elif title in {"private", "private group", "nhóm riêng tư"}:
                    choices["private"] = obj["name"]
            if len(choices) == 1:
                privacy, name = next(iter(choices.items()))
                add(platform, [url], group_id[1], "group", name, "Archived Group object: matching ID + privacy_info.title",
                    check["checkedAt"], "IDENTITY_CONFIRMED", True, "", privacy=privacy)
            continue
        if insta:
            matches = {}
            for obj in script_objects(text):
                handle = obj.get("username")
                pk = str(obj.get("pk"))
                follower = str(obj.get("follower_count"))
                if isinstance(handle, str) and handle.casefold() == insta[1].casefold() and pk.isdigit() and follower.isdigit():
                    matches[pk, follower] = obj.get("full_name") or handle
            if len(matches) == 1:
                (pk, follower), name = next(iter(matches.items()))
                add(platform, [url], pk, "profile", name, "Archived profile username + native pk + follower_count",
                    check["checkedAt"], "IDENTITY_CONFIRMED", True, follower + " followers")
            continue
        payload = re.search(r'<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', text, re.S)
        if not payload:
            continue
        info = json.loads(payload[1]).get("__DEFAULT_SCOPE__", {}).get("webapp.user-detail", {}).get("userInfo", {})
        user = info.get("user") or {}
        handle = urlsplit(owner["url"]).path.strip("/").removeprefix("@")
        if str(user.get("id")) != owner["nativeId"] or user.get("uniqueId", "").casefold() != handle.casefold():
            continue
        stats = info.get("statsV2") or info.get("stats") or {}
        count = str(stats.get("followerCount"))
        if count.isdigit():
            tiktok_metadata[owner["_id"]] = count + " followers (matched profile's native userInfo.stats followerCount)"

    for check in load(PLAN, "completion/retry-public-results.json"):
        if check["platform"] != "youtube" or check.get("status") != "live" or not check.get("id") or not check.get("responseFile"):
            continue
        snapshot = WORKSPACE / Path(check["responseFile"])
        if not snapshot.is_file():
            continue
        text = snapshot.read_text(encoding="utf-8")
        initial = re.search(r"(?:var\s+)?ytInitialData\s*=\s*(?=\{)", text)
        if not initial:
            continue
        try:
            data, _ = json.JSONDecoder().raw_decode(text[initial.end():])
        except ValueError:
            continue
        native = data.get("metadata", {}).get("channelMetadataRenderer", {}).get("externalId")
        if check["id"] != native:
            continue
        values = {obj["subscriberCountText"].get("simpleText") for obj in objects_in(data.get("header", {}))
                  if isinstance(obj.get("subscriberCountText"), dict)} - {None}
        if len(values) == 1:
            add("youtube", [check.get("url")], native, "channel", check.get("name"),
                "Archived channelMetadataRenderer.externalId + channel header subscriberCountText",
                check["checkedAt"], "IDENTITY_CONFIRMED", True, values.pop())

    for file in ("completion/resolved-source-identities-final.json", "completion/tiktok-owner-verified.json"):
        for row in load(PLAN, file):
            add(row["platform"], [row["url"]], row["nativeId"], row["type"], row.get("name"),
                row["evidence"], row["checkedAt"], row["decision"], row["decision"] == "IDENTITY_CONFIRMED",
                tiktok_metadata.get(row["_id"], row["evidence"]))
    for row in load(PLAN, "completion/sources-final-audit.json"):
        evidence = row.get("evidence") or ""
        kind = row["canonicalId"].split(":")[1] if row["canonicalId"].count(":") >= 2 else None
        add(row["platform"], [row.get("canonicalUrl"), row.get("url")], row.get("nativeId") or row.get("placeId"),
            kind, row.get("name"), evidence, row.get("checkedAt"), row["decision"],
            row["decision"] == "IDENTITY_CONFIRMED" and bool(evidence), evidence + " " + (row.get("note") or ""))
    for row in load(PREVIOUS_PLAN, "facebook-resolved.json"):
        evidence = row.get("evidencePath") or ""
        add("facebook", [row.get("url"), row.get("inputUrl")], row.get("id"), row.get("type"),
            row.get("name"), evidence, row.get("resolvedAt"), row["status"],
            row["status"] == "RESOLVED" and bool(evidence) and evidence.upper() != "URL_ONLY", "")
    return result


HASHTAG_QUERIES = {
    "#VietinBank": "VietinBank", "#VPBank": "VPBank", "#nhucachmeyeuthuong": "Như Cách Mẹ Yêu Thương",
    "#CPVietnam": "C.P Việt Nam", "#LGVietnam": "LG Vietnam", "#Mì3Miền": "Mì 3 Miền",
    "#PhởĐệNhất": "Phở Đệ Nhất",
}
MAIN_HDBANK = {"hdbank", "hdsaison", "hdsecurities", "chutichnguyenthiphuongthao", "sovicogroup", "vikki"}
SAINT_INDUSTRY = {"keodan", "lamsong", "nhuanano", "tampanel", "tiktokshopms", "tranthachcao", "ungdungsanvach"}
PNJ_SUBJECT_FILTERS = {"nhancuoi", "trangsucbac", "trangsuccuoi", "trangsuceczcz", "trangsuckimcuong", "trangsucngoctrai", "vangmieng"}
ALIASES = {
    ("Central Retail", "tiktok shopping"): "TikTok Shop",
    ("Central Retail", "siêu thị vinmart"): "Winmart",
    ("Gỗ An Cường", "hafele vietnam"): "Hafele",
    ("Vinamilk", "bột ăn dặm ridielac vinamilk"): "Vinamilk Ridielac",
    ("Vinamilk", "kem delight vinamilk"): "Vinamilk Delight",
    ("Vinamilk", "nước dừa vinamilk"): "Vinamilk Cocofresh",
    ("Vinamilk", "nước tinh khiết vinamilk"): "Vinamilk ICY",
    ("Vinamilk", "sữa sure prevent gold vinamilk"): "Vinamilk Sure Prevent",
    ("Vinamilk", "sữa optimum gold vinamilk"): "Vinamilk Optimum",
    ("Vinamilk", "sữa chua uống probi vinamilk"): "Vinamilk Probi",
    ("Vinamilk", "sữa chua uống yomilk vinamilk"): "Vinamilk Yomilk",
    ("Vinamilk", "sữa trái cây hero vinamilk"): "Vinamilk Hero",
}


def keyword_records():
    accepted = {}
    decisions = []
    for row in load(PLAN, "completion/keywords-final.json"):
        project, original, subject, level = (row[k] for k in ("project", "query", "subject", "level"))
        query = " ".join(unicodedata.normalize("NFC", original).strip(" \t\r\n\"“”‘’•").split())
        reasons = []
        exact_evidence = list(row["searchEvidence"])
        status = "READY"
        subject_key = norm(subject)
        if project == "HDBank" and subject_key not in MAIN_HDBANK:
            level = 2
            reasons.append("Ngân hàng khác hoặc chủ đề ngành trong project HDBank.")
        if project == "NAPAS MS" and subject_key != "napas":
            level = 2
            reasons.append("Đơn vị thanh toán khác hoặc tin ngành trong project NAPAS.")
        if project == "Saint-gobain" and subject_key in SAINT_INDUSTRY:
            level = 2
            reasons.append("Chủ đề ngành hoặc kênh bán hàng; không phải nhãn chủ dự án.")
        if project == "Ngành Mỹ Phẩm":
            level = 2
            reasons.append("Danh sách nhãn theo dõi theo ngành; plan không chỉ định một nhãn chủ.")
        if project == "Bệnh Viện Quốc Tế Mỹ" and level == 1:
            query = "AIH"
            status = "READY"
            exact_evidence = ["User chọn AIH là keyword chạy; hồ sơ chính thức xác nhận AIH là tên rút gọn của Bệnh viện Quốc tế Mỹ. Chưa kiểm tra kết quả AIH trên từng nền tảng."]
            reasons.append("Dùng AIH cho chủ thể chính; các alias và cụm ghép lưu ở dữ liệu plan gốc.")
        elif query.startswith("#"):
            query = HASHTAG_QUERIES.get(query, query.lstrip("#"))
            status = "REVIEW"
            exact_evidence = []
            reasons.append("Đã chuyển hashtag sang cụm search thường; kết quả của hashtag cũ không xác nhận cụm mới.")
        if project == "Lazada" and subject_key == "lazada2026":
            query = "Lazada"
            status = "REVIEW"
            exact_evidence = []
            reasons.append("Bỏ năm ghi trong nhãn plan; cần kiểm tra cụm sau chuẩn hóa.")
        if project == "Tân Hiệp Phát" and query.startswith("Các loại nước khác "):
            query = query.removeprefix("Các loại nước khác ")
            status = "REVIEW"
            exact_evidence = []
            reasons.append("Bỏ nhãn phân nhóm nội bộ.")
        if project == "PNJ" and subject_key in PNJ_SUBJECT_FILTERS:
            decisions.append((project, subject, original, level, "ES_ONLY", "Cụm lọc nhóm sản phẩm đi kèm PNJ; đã có keyword thương hiệu PNJ.", encode(row)))
            continue
        alias = ALIASES.get((project, original.casefold()))
        if alias:
            decisions.append((project, subject, original, level, "FOLDED_ALIAS", "Cùng chủ thể với keyword " + alias, encode(row)))
            continue
        if re.search(r'(?i)\b(?:AND|OR|NOT|NEAR)\b|[+"“”]\s*["“”]|[{}\[\]<>*=|\\]|(?:siteId|siteName|content|title):', query):
            decisions.append((project, subject, original, level, "ES_ONLY", "Cú pháp ghép hoặc trường truy vấn ES.", encode(row)))
            continue
        if not query or not re.search(r"\w", query) or len(query) > 100:
            decisions.append((project, subject, original, level, "REVIEW", "Chưa có cụm search độc lập.", encode(row)))
            continue
        if reasons:
            decisions.append((project, subject, original, level, status, " ".join(reasons), encode(row)))
        key = (project, query.casefold())
        item = accepted.get(key)
        if not item:
            accepted[key] = dict(keyword=query, project=project, level=level, status=status, project_status=row["projectStatus"],
                                 subjects=[subject], evidence=exact_evidence, originals=[row], reasons=reasons)
        else:
            item["originals"].append(row)
            item["subjects"].append(subject)
            item["evidence"].extend(exact_evidence)
            item["reasons"].extend(reasons)
            if item["level"] != level:
                item["status"] = "REVIEW"
                item["reasons"].append("Cùng cụm search mang hai vai trò trong project; cần chọn level theo topic.")
            elif status == "READY":
                item["status"] = "READY"
    return list(accepted.values()), decisions


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE catalog_metadata (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE TABLE projects (
    project_name TEXT PRIMARY KEY, plan_status TEXT NOT NULL, plan_url TEXT, rows_json TEXT NOT NULL
);
CREATE TABLE sources (
    source_key TEXT PRIMARY KEY, channel TEXT NOT NULL, type TEXT NOT NULL,
    name TEXT, link TEXT NOT NULL, id TEXT, id_status TEXT NOT NULL,
    follower INTEGER, follower_kind TEXT, follower_precision TEXT,
    follower_as_of TEXT, follower_source TEXT, follower_evidence TEXT,
    group_privacy TEXT, group_privacy_status TEXT,
    source_status TEXT NOT NULL, identity_evidence_json TEXT NOT NULL,
    original_links_json TEXT NOT NULL, evidence_json TEXT NOT NULL
);
CREATE TABLE source_projects (
    source_key TEXT NOT NULL REFERENCES sources, project_name TEXT NOT NULL REFERENCES projects,
    origins_json TEXT NOT NULL, PRIMARY KEY(source_key, project_name)
);
CREATE TABLE people (
    person_id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT,
    categories_json TEXT NOT NULL, evidence_class TEXT NOT NULL,
    source_ids_json TEXT NOT NULL, profile_urls_json TEXT NOT NULL, classification_json TEXT NOT NULL
);
CREATE TABLE source_people (
    source_key TEXT NOT NULL REFERENCES sources, person_id TEXT NOT NULL REFERENCES people,
    attribution_status TEXT NOT NULL, links_json TEXT NOT NULL, PRIMARY KEY(source_key, person_id)
);
CREATE TABLE keywords (
    keyword TEXT NOT NULL, project_name TEXT NOT NULL REFERENCES projects, level INTEGER NOT NULL CHECK(level IN (1,2)),
    status TEXT NOT NULL, project_status TEXT NOT NULL, subjects_json TEXT NOT NULL, evidence_json TEXT NOT NULL,
    originals_json TEXT NOT NULL, reasons_json TEXT NOT NULL, PRIMARY KEY(project_name, keyword)
);
CREATE TABLE keyword_decisions (
    project_name TEXT, subject TEXT, original TEXT, level INTEGER, decision TEXT, reason TEXT, original_json TEXT
);
CREATE TABLE es_keyword_cells (
    project_name TEXT, kind TEXT, raw_value TEXT, plan_url TEXT, sheet TEXT, cell TEXT, row_json TEXT NOT NULL
);
CREATE TABLE plan_access_gaps (
    project_name TEXT, project_status TEXT, plan_url TEXT, status TEXT
);
CREATE INDEX sources_channel_type ON sources(channel, type);
CREATE INDEX sources_channel_id ON sources(channel, id);
CREATE INDEX sources_followers ON sources(follower);
CREATE INDEX source_projects_by_project ON source_projects(project_name, source_key);
CREATE INDEX source_people_by_person ON source_people(person_id, source_key);
CREATE INDEX keywords_by_status ON keywords(status, project_status, level);
CREATE INDEX decisions_by_project ON keyword_decisions(project_name, decision);
CREATE INDEX es_cells_by_project ON es_keyword_cells(project_name, sheet, cell);
CREATE VIEW source_catalog AS
    SELECT s.channel AS Channel, s.type AS Type, s.name AS Name, s.link AS Link, s.id AS Id,
           s.follower AS Follower, p.project_name AS ProjectName,
           s.id_status, s.group_privacy, s.group_privacy_status, s.follower_kind,
           s.follower_precision, s.follower_as_of, s.follower_source, s.source_status, s.source_key,
           s.follower_evidence, s.identity_evidence_json, s.original_links_json, s.evidence_json
      FROM sources s LEFT JOIN source_projects p USING(source_key);
CREATE VIEW keyword_catalog AS
    SELECT keyword AS Keyword, project_name AS ProjectName, level AS Level,
           CASE WHEN lower(project_status) = 'stop' AND status = 'READY' THEN 'PAUSED' ELSE status END AS Status,
           project_status, subjects_json, evidence_json, reasons_json
      FROM keywords;
CREATE VIEW search_queue AS
    SELECT * FROM keyword_catalog WHERE Status = 'READY';
"""


def consume_sources(db):
    index = observation_index()
    sources = {}
    memberships = collections.defaultdict(list)
    people_links = collections.defaultdict(list)
    claims = collections.defaultdict(list)
    people_rows = []

    def add_source(platform, url):
        key = url_key(platform, url)
        if key is None:
            return None
        if key not in sources:
            sources[key] = dict(platform=platform, url=url, names=[], original_links=[], plan_types=[], origins=[], plan_rows=[])
        return key

    for record in load(PLAN, "sources-normalized.json"):
        platform = record["channel"].lower()
        key = add_source(platform, record["url"])
        if key is None:
            raise ValueError("Invalid normalized plan URL: " + record["url"])
        row = sources[key]
        if record.get("name"):
            row["names"].append(record["name"])
        row["original_links"].extend(record.get("originalLinks") or [record["url"]])
        row["origins"].extend(record["origins"])
        row["plan_rows"].append(record["key"])
        if record.get("type"):
            row["plan_types"].append(record["type"])
        for project in record["projects"]:
            memberships[key, project].extend(o for o in record["origins"] if o.get("project") == project)

    with (KOL / "vietnamese-with-platforms.full.json").open(encoding="utf-8") as handle:
        for line in handle:
            if not line.startswith('{"person_id"'):
                continue
            person = json.loads(line.rstrip("\n").removesuffix(","))
            eligible = [link for link in person["platform_links"] if link["platform"] in PLATFORMS]
            if not eligible:
                continue
            categories = person["occupations"]
            people_rows.append((person["person_id"], person["name"], categories[0] if categories else None,
                                encode(categories), person["classification_strength"], encode(person["source_ids"]),
                                encode(person["source_urls"]), encode(person["vietnam_classification"])))
            per_platform = collections.defaultdict(set)
            for link in eligible:
                platform = link["platform"]
                # Normalize the actual input link; the older canonical field collapses some /pg routes.
                key = add_source(platform, link["url"])
                if key is None:
                    raise ValueError("Invalid KOL link")
                sources[key]["original_links"].append(link["url"])
                people_links[key, person["person_id"]].append(link)
                per_platform[platform].add(key)
            for platform, keys in per_platform.items():
                if len(keys) != 1:
                    continue
                key = next(iter(keys))
                if re.search(r"(?i)fan\s*club|cộng đồng|hội nhóm|vietnam official", key[1]):
                    continue
                for profile in person["source_profiles"]:
                    matching = [link for link in profile["platform_links"] if link["platform"] == platform
                                and link["attribution"] == "subject_profile_link" and url_key(platform, link["url"]) == key]
                    if matching and (claim := biography_followers(profile, platform)):
                        claims[key].append(claim)

    keys = {key: hashlib.sha256(encode(key).encode()).hexdigest()[:24] for key in sources}
    saved_people_by_source = collections.defaultdict(list)
    people_names = {row[0]: row[1] for row in people_rows}
    for key, person in people_links:
        saved_people_by_source[key].append(person)
    for key, row in sources.items():
        platform, link = row["platform"], row["url"]
        candidate_id = numeric_url_id(platform, key)
        obs = list(index.get(key, ()))
        safe = [o for o in obs if o["safe"] and o["id"]]
        pairs = {(o["type"], o["id"]) for o in safe}
        conflict = len(pairs) > 1
        best = max(safe, key=lambda o: o["checked_at"] or "", default=None) if not conflict else None
        native = best["id"] if best else candidate_id
        id_status = "ARCHIVE_VERIFIED" if best else "CONFLICT" if conflict else "URL_ONLY" if candidate_id else "UNRESOLVED"
        slug_group = platform == "facebook" and bool(re.fullmatch(r"facebook\.com/groups/[\w.-]+", key[1]))
        kind = best["type"] if best else ("group" if slug_group else "unknown") if platform == "facebook" else next(iter(row["plan_types"]), None)
        if not kind or kind == "unknown" and platform in {"instagram", "tiktok"} and key in saved_people_by_source:
            kind = "channel" if platform == "youtube" else "profile" if platform in {"instagram", "tiktok"} else "unknown"
        privacy = privacy_from_plan(row["origins"]) if kind == "group" else {}
        explicit_privacy = [o for o in safe if o["privacy"]]
        platform_privacy = explicit_privacy or [o for o in safe if re.search(r"\bpublic group header\b", o["evidence"], re.I)]
        if kind == "group":
            for observation in platform_privacy:
                privacy[observation["privacy"] or "public"] = observation["evidence"]
        visibility = next(iter(privacy)) if len(privacy) == 1 else None
        privacy_status = ("CONFLICT" if len(privacy) > 1 else "PLATFORM_OBSERVATION" if platform_privacy else "PLAN_LABEL"
                          if privacy else "UNKNOWN") if kind == "group" else None
        if kind == "group":
            kind += "_" + (visibility or "unknown")
        route = urlsplit(link).path
        content_reference = (
            (platform == "youtube" and (urlsplit(link).hostname == "youtu.be" or re.match(r"^/(?:watch|shorts|live|playlist)(?:/|$)", route)))
            or (platform == "tiktok" and re.search(r"/(?:video|photo)/", route))
            or (platform == "instagram" and re.search(r"^/(?:p|reel|reels|stories)/", route))
            or (platform == "linkedin" and re.search(r"^/(?:feed/update|posts|pulse)/", route))
        )
        if content_reference and not best:
            kind = "content_reference"
        display_names = list(dict.fromkeys(row["names"]))
        person_ids = saved_people_by_source.get(key, [])
        name = (best and best["name"]) or next(iter(display_names), None) or (people_names[person_ids[0]] if len(person_ids) == 1 else None)
        archived = [m for o in safe if o["type"] in {"page", "user", "profile", "channel"} and (m := observed_followers(o))]
        follower = max(archived, key=lambda x: x[3] or "", default=None)
        if not follower and len(person_ids) == 1:
            credited_claims = claims.get(key, [])
            if len({m[0] for m in credited_claims}) == 1:
                follower = credited_claims[0]
        value, precision, evidence, as_of, metric_source, metric_kind = follower or (None,) * 6
        host = urlsplit(link).hostname or ""
        if host == "fireant.vn" or host.endswith(".fireant.vn"):
            source_status = "BLOCKED_BY_PROJECT"
        elif content_reference and not best:
            source_status = "PLAN_CONTENT_REFERENCE"
        elif conflict:
            source_status = "IDENTITY_REVIEW"
        else:
            source_status = "ARCHIVED" if best else "NEEDS_RESOLVE" if platform in PLATFORMS else "PLAN_REFERENCE"
        db.execute("INSERT INTO sources VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
            keys[key], platform, kind, name, link, native, id_status, value, metric_kind, precision, as_of,
            metric_source, evidence, visibility, privacy_status, source_status,
            encode([{k: o[k] for k in ("id", "type", "evidence", "checked_at", "url")} for o in safe]),
            encode(list(dict.fromkeys([link, *row["original_links"]]))),
            encode({"plan_keys": row["plan_rows"], "plan_names": display_names, "plan_types": list(set(row["plan_types"])),
                    "privacy_evidence": privacy, "archive_observations": [
                        {k: o[k] for k in ("status", "id", "type", "name", "checked_at", "url")}
                        for o in obs if o["status"]], "shared_by_people": len(person_ids)}),
        ))
    db.executemany("INSERT INTO people VALUES (?,?,?,?,?,?,?,?)", people_rows)
    db.executemany("INSERT INTO source_people VALUES (?,?,?,?)", (
        (keys[key], person, "SOURCE_LISTED_UNVERIFIED", encode(links)) for (key, person), links in people_links.items()))
    db.executemany("INSERT INTO source_projects VALUES (?,?,?)", (
        (keys[key], project, encode(origins)) for (key, project), origins in memberships.items()))
    assert len(people_rows) == 13802, len(people_rows)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    target = OUTPUT / "source-keyword-catalog.sqlite"
    tmp = OUTPUT / "source-keyword-catalog.building.sqlite"
    if tmp.exists():
        raise FileExistsError(f"An unfinished build exists at {tmp}")
    db = sqlite3.connect(tmp)
    try:
        db.executescript(SCHEMA)
        with db:
            projects = collections.defaultdict(list)
            for p in load(PLAN, "projects-current.json"):
                projects[p["project"]].append(p)
            records, decisions = keyword_records()
            plan_sources = load(PLAN, "sources-normalized.json")
            names = {p for source in plan_sources for p in source["projects"]} | {row["project"] for row in records}
            for name in sorted(set(projects) | names):
                rows = projects[name]
                chosen = next((row for row in rows if row["status"] != "stop"), rows[0] if rows else {})
                db.execute("INSERT INTO projects VALUES (?,?,?,?)", (name, chosen.get("status", "unknown"), chosen.get("url"), encode(rows)))
            consume_sources(db)
            db.executemany("INSERT INTO keywords VALUES (?,?,?,?,?,?,?,?,?)", [
                (r["keyword"], r["project"], r["level"], r["status"], r["project_status"], encode(r["subjects"]),
                 encode(r["evidence"]), encode(r["originals"]), encode(r["reasons"])) for r in records
            ])
            for r in load(PLAN, "completion/topic-decisions-final.json"):
                if r["decision"] == "EXCLUDED":
                    decisions.append((r["project"], r["subject"], r["query"], r["level"], "PREVIOUSLY_EXCLUDED", r["reason"], encode(r)))
            for r in load(PLAN, "completion/keywords-excluded-final.json"):
                decisions.append((r["project"], r["subject"], r["query"], r["level"], "PREVIOUSLY_EXCLUDED", r["reason"], encode(r)))
            db.executemany("INSERT INTO keyword_decisions VALUES (?,?,?,?,?,?,?)", decisions)
            db.executemany("INSERT INTO es_keyword_cells VALUES (?,?,?,?,?,?,?)", (
                (r["project"], r["kind"], r["value"], r["planUrl"], r["sheet"], r["cell"], encode(r))
                for r in load(PLAN, "keyword-cells-separated.json")
            ))
            gaps = load(PLAN, "completion/plan-access-final.json")
            db.executemany("INSERT INTO plan_access_gaps VALUES (?,?,?,?)", (
                (r["Project"], r["ProjectStatus"], r["PlanURL"], r["Result"]) for r in gaps))
            metadata = {
                "created_at": datetime.now(timezone.utc).isoformat(),
                "plan_snapshot": "2026-11-10/11",
                "kol_snapshot": "2026-11-18/19",
                "keyword_status": {"READY": "Có thể đưa vào search queue", "PAUSED": "Project stop trong bản plan",
                                   "REVIEW": "Cụm sau khi sửa hoặc vai trò cần kiểm tra"},
                "search_queue_scope": "Keyword READY thuộc project chưa stop; bằng chứng lịch sử chỉ áp dụng cho các nền tảng được ghi.",
                "plan_source_input_count": len(plan_sources),
                "follower_note": "Số từ phản hồi nền tảng lưu trữ hoặc tuyên bố trong tiểu sử ghi rõ; giữ ngày, nguồn và độ chính xác. Null nếu thiếu.",
                "category_note": "Nhãn nghề của kho KOL; chưa phân loại category bằng AI.",
                "source_link_note": "ProjectName từ dòng plan có đúng URL đã chuẩn hóa; liên kết đến người từ kho KOL. Không suy ra project theo tên người.",
                "group_scope": "group_public/private khi có nhãn plan hoặc bằng chứng công khai, group_unknown nếu thiếu hoặc mâu thuẫn.",
                "aih_decision": {"keyword": "AIH", "level": 1, "plan_cell": "Keyword!B2",
                                 "official_reference": "https://www.aih.com.vn/benh-vien-aih"},
            }
            db.executemany("INSERT INTO catalog_metadata VALUES (?,?)", [(k, encode(v)) for k, v in metadata.items()])
        assert db.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        assert not db.execute("PRAGMA foreign_key_check").fetchall()
        ai = db.execute("SELECT Keyword, Level FROM keyword_catalog WHERE ProjectName='Bệnh Viện Quốc Tế Mỹ' AND Level=1").fetchall()
        assert ai == [("AIH", 1)], ai
        assert not db.execute("SELECT 1 FROM search_queue WHERE instr(Keyword,'#')=1 OR Keyword LIKE '%+\"%'").fetchall()
        assert db.execute("SELECT count(*) FROM source_catalog WHERE ProjectName IS NOT NULL").fetchone()[0] > 0
        summary = {table: db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in
                   ("projects", "sources", "source_projects", "people", "keywords", "search_queue", "keyword_decisions", "es_keyword_cells", "plan_access_gaps")}
        summary["keywords_by_status_level"] = db.execute("SELECT Status, Level, count(*) FROM keyword_catalog GROUP BY Status, Level").fetchall()
        summary["facebook_by_type"] = db.execute("SELECT type, count(*) FROM sources WHERE channel='facebook' GROUP BY type").fetchall()
        summary["followers_available"] = db.execute("SELECT follower_kind, count(*) FROM sources WHERE follower IS NOT NULL GROUP BY follower_kind").fetchall()
        summary["active_plan_gaps"] = db.execute("SELECT count(*) FROM plan_access_gaps WHERE lower(project_status)!='stop'").fetchone()[0]
        summary["native_ids"] = db.execute("SELECT id_status, count(*) FROM sources WHERE id IS NOT NULL GROUP BY id_status").fetchall()
        summary["kol_source_urls"] = db.execute("SELECT count(DISTINCT source_key) FROM source_people").fetchone()[0]
        summary["plan_source_urls"] = db.execute("SELECT count(DISTINCT source_key) FROM source_projects").fetchone()[0]
    finally:
        db.close()
    tmp.replace(target)
    print(json.dumps({"database": str(target), **summary}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
