"""Validate individual plan hashtags with public hashtag result pages."""
import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import gzip
import json
import re
import sqlite3
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from audit_catalog_search_keywords import DB, ROOT, compact, encode, fold
from extract_project_sources import read_book

AUDIT_ID = "2026-11-19-hashtags"
INVENTORY = ROOT / "hashtag-candidates.json"
FETCHED = ROOT / "hashtag-search-observations.jsonl"
REPORT = ROOT / "hashtag-review.json"
TAG = re.compile(r"(?<![\w#/#])#([\w][\w\u0300-\u036f]{1,99})(?![\w\u0300-\u036f])")
URL = re.compile(r"https?://[^\s\"<>]+", re.I)
OUTSIDE_SHEETS = re.compile(r"spam|loại trừ|negative check|label rules|sentiment|(?:^|\s)data(?:\s|$)|seeding", re.I)
DESCRIPTORS = re.compile(r"^(?:ngan hang so|ngan hang|nha hang|tap doan|cong ty|sua|son|my pham|"
                         r"tra|bia|vai tro|san bay|tieng anh|phu kien|benh vien|bao hiem)\s+")
IGNORE = {"mainbrand","main","competitor","nganh","topic","hashtag","brand","brandtrackingchung","sponsors","tinmoi",
          "seeding","fyp","viral","trend","xuhuong","vietnam","tiktok","facebook","trending","shorts","foryou"}
SCOPE_BLOCKS = {
    "M-Village": re.compile(r"^(?:Keywords|Re - Keywords)$", re.I),
    "Saint-gobain": re.compile(r"\bcampaign xanh\b", re.I),
    "Galaxy Cinema": re.compile(r"^(?:Keywords|Re - Keywords)$", re.I),
    "ECCO Factory 2026": re.compile(r"^(?:Keywords|Re - Keywords)$", re.I),
    "Campaign FluMist": re.compile(r"^(?:Keywords|Re - Keywords)$", re.I),
}

# The actual results concern namesakes, foreign branches or different markets.
# These decisions apply to the exact tag, not to more specific plan variants.
MIXED_SEARCH_TAGS = {
    ("ECCO Factory 2026", "#ecco"): "Mẫu chủ yếu về giày bán lẻ toàn cầu, có kết quả nhạc và trò chơi trùng tên.",
    ("Gaz Vietnam", "#kimlong"): "Ca sĩ KIMLONG chiếm phần lớn mẫu, xen với hãng xe.",
    ("Giao Hàng Nhanh", "#bestexpress"): "Mẫu chủ yếu về dịch vụ ở Thái Lan và Malaysia.",
    ("Galaxy Cinema", "#dearyou"): "Mẫu lẫn nhiều bài hát và MV mang tên Dear You.",
    ("Golden Gate Group", "#chaoxian"): "Tên hãng máy đóng gói và tên điệu múa lấn át nhà hàng.",
    ("Golden Gate Group", "#manmaru"): "Phần lớn mẫu về nhà hàng Manmaru ở Philippines.",
    ("Golden Gate Group", "#quanbui"): "Mẫu lẫn nghệ sĩ Quân Bùi và nhà hàng Quán Bụi.",
    ("Green SM", "#grabtaxi"): "Mẫu chủ yếu ở các thị trường ngoài Việt Nam.",
    ("Green SM", "#grabbike"): "Mẫu về GrabBike có tỷ lệ đáng kể ngoài Việt Nam.",
    ("Green SM", "#bebike"): "Mẫu lẫn thương hiệu xe đạp và cửa hàng xe đạp trùng tên.",
    ("Green SM", "#becar"): "Mẫu lẫn nội dung mang tên Bećar và video chỉ nhắc Be chung.",
    ("Hafele", "#blanco"): "Mẫu chủ yếu là ca sĩ và bài hát trùng tên, rất ít kết quả về chậu rửa.",
    ("Hafele", "#higold"): "Mẫu chủ yếu thuộc tài khoản các thị trường khác.",
    ("ILA", "#yola"): "Phần lớn mẫu thuộc nghệ sĩ Yola hoặc nhân vật cùng tên.",
    ("ILA", "#academicresult"): "Cụm từ phổ thông có kết quả ngoài Anh ngữ Yola.",
    ("Hapas", "#hapas"): "Mẫu lẫn guitar Hapas, nội dung trò chơi và kênh tin trùng tên.",
    ("Masan", "#uniben"): "Mẫu chủ yếu về University of Benin.",
    ("Masan", "#tide"): "Mẫu chủ yếu là nội dung khác trùng tên Tide.",
    ("NAB", "#axon"): "Mẫu chủ yếu về cổ phiếu và sản phẩm của Axon toàn cầu.",
    ("NAB", "#naver"): "Mẫu chủ yếu về cổ phiếu tại Hàn Quốc.",
    ("NAB", "#nvidia"): "Mẫu chủ yếu về tin quốc tế và cổ phiếu, thiếu liên hệ với Nvidia Việt Nam.",
    ("NAB", "#boschvietnam"): "Mẫu bao phủ Bosch nói chung, gồm thiết bị gia dụng và xây dựng, khác phạm vi Bosch Global Software Technologies.",
    ("Sabeco", "#sututrang"): "Mẫu về phim, động vật, câu lạc bộ bóng đá và cờ tướng.",
    ("Sabeco", "#redruby"): "Mẫu lẫn phim, trò chơi và sản phẩm dã ngoại; có hashtag #BiaRedRuby rõ hơn trong plan.",
    ("Sabeco", "#carlsberg"): "Mẫu chủ yếu về nhà máy Copenhagen và chủ thể ở các thị trường ngoài Việt Nam.",
    ("Saint-gobain", "#weber"): "Mẫu lẫn nhà soạn nhạc Carl Maria von Weber và dụng cụ nướng Weber.",
    ("ShopeeFood", "#grabfood"): "Mẫu có nhiều kết quả về GrabFood Thái Lan, vượt phần nội dung đúng thị trường Việt Nam.",
    ("UOB", "#uobtmrw"): "Mẫu chủ yếu về UOB TMRW ở các thị trường ngoài Việt Nam.",
}

# Aliases recognized by the plan and reviewed plain keywords, including brands
# where a single short acronym would itself be too ambiguous.
PROVEN_ALIASES = {
    "cpvietnam": {"cpvietnam", "charoenpokphandvietnam", "cpvietnamcorporation"},
    "lorealparis": {"lorealparis", "loreal"},
    "winmart": {"winmart", "vinmart"},
    "xanhsmfood": {"xanhsmngon", "greensmfood", "xanhsmfood"},
    "greensmfood": {"xanhsmngon", "greensmfood", "xanhsmfood"},
    "momopay": {"momo", "vimomo", "momopay"},
    "befood": {"befood"},
    "benhvienquoctehanhphuc": {"benhvienhanhphuc", "benhvienquoctehanhphuc", "hanhphuchospital", "hanhphucinternationalhospital"},
    "benhvienhoanmy": {"benhvienhoanmy", "hoanmymedical", "hoanmyhospital"},
    "gogihouse": {"gogihouse", "gogikoreanstreetbbq"},
    "vietinbank": {"vietinbank", "nganhangcongthuongvietnam"},
    "bvbank": {"bvbank", "nganhangbanviet", "vietcapitalbank"},
    "lgvietnam": {"lg", "lgvietnam","lgelectronics"},
    "spxexpress": {"spxexpress","shopeeexpress"},
    "mvillage": {"mvillage","modernvillage","modernvillagelifestyle","savvymvillage","signaturemvillage","expressmvillage"},
    "greensmartmobility": {"xanhsm","xanhgsm","greensm","greensmartmobility"},
    "greensm": {"xanhsm","xanhgsm","greensm","greensmartmobility"},
    "begroup": {"begroup","bevietnam","beapp","bebike","becar","befood","bedelivery","berides"},
    "benhvienfv": {"benhvienfv","fvhospital","benhvienphapviet"},
    "benhviendakhoatamanh": {"benhviendakhoatamanh","benhvientamanh","tamanhhospital","bvdktamanh","bvtamanh"},
    "benhviendakhoahongngoc": {"benhviendakhoahongngoc","benhvienhongngoc","hongngochospital","bvdkhongngoc","bvhongngoc"},
}
SHORT_BRANDS = {"lg", "acb", "msb", "hsb", "ocb", "ncb", "uob", "vib", "svr", "ghn", "spx"}

OWN_CAMPAIGNS = {
    ("C.P Việt Nam (SmartCom)", "nhucachmeyeuthuong"): ("C.P. Việt Nam",1),
    ("C.P Việt Nam (SmartCom)", "veancomcungcp"): ("C.P. Việt Nam",1),
    ("C.P Việt Nam (SmartCom)", "tutrangtraidenbepnha"): ("C.P. Việt Nam",1),
    ("ShopeeFood", "haiphongvidungdinh"): ("ShopeeFood",1),
    ("ShopeeFood", "trumdeallenlive"): ("ShopeeFood",1),
    ("SPX", "saophaixoan"): ("SPX Express",1),
    ("Cake", "denhucake"): ("Ngân hàng số Cake",1),
}

CHANNEL_EVIDENCE = {
    ("C.P Việt Nam (SmartCom)", "C.P. Việt Nam"): {
        "Từ Trang Trại Đến Bếp Nhà": "https://www.youtube.com/watch?v=I9wmRNo_y_Y",
    },
}


def connect():
    db = sqlite3.connect(DB.resolve().as_uri()+"?mode=rw", uri=True)
    db.row_factory = sqlite3.Row
    return db


def normalized_hashtags(value, in_column=False):
    plain = URL.sub(" ", unicodedata.normalize("NFC", value))
    found = ["#" + s for s in TAG.findall(plain) if any(c.isalpha() for c in s)]
    if in_column:
        for piece in re.split(r"[,;\n]+", plain):
            piece = piece.strip(' \t"“”•')
            if re.fullmatch(r"[\w][\w\u0300-\u036f]{1,99}", piece) and any(c.isalpha() for c in piece):
                found.append("#"+piece)
    return list(dict.fromkeys(found))


def subject_forms(value):
    primary = compact(value)
    without_description = compact(DESCRIPTORS.sub("", fold(value)))
    forms = {primary, without_description}
    for name in list(forms):
        short = re.sub(r"(?:vietnam|vietna?m|official|corporation)$", "", name)
        if len(short) >= 4:
            forms.add(short)
        forms |= PROVEN_ALIASES.get(name, set())
    return {f for f in forms if len(f) >= 3 and f not in IGNORE}


def locate_subject(project, hashtag, origins, anchors):
    tag = compact(hashtag)
    if tag in IGNORE:
        return None, "GENERIC"
    if (project, tag) in OWN_CAMPAIGNS:
        name, level = OWN_CAMPAIGNS[project, tag]
        return {"subject": name, "level": level, "anchors": sorted(subject_forms(name)), "basis":"mapped campaign in plan"}, None
    proposals = []
    hints = {compact(o["subject"]) for o in origins if o["subject"]}
    for row in anchors[project]:
        matched = {a for a in row["anchors"] if a == tag or (len(a) >= 4 and a in tag)
                   or (a in SHORT_BRANDS and len(tag)>len(a)+3 and (tag.startswith(a) or tag.endswith(a)))}
        hinted = {a for a in row["anchors"] if a in hints}
        if not matched and not hinted:
            continue
        score = max([len(a) * 3 + (80 if a == tag else 0) for a in matched] or [0])
        if hinted:
            score += 6 if matched else 1
        proposals.append((score,row))
    # A named plan row has priority when its full subject matches the hashtag.
    # A shorter competing alias from an existing keyword can still be checked.
    for origin in origins:
        name, role = origin["subject"], compact(origin["role"])
        primary = compact(name)
        if len(primary) < 4 or role not in {"mainbrand","competitor","industry","nganh","doithu"}:
            continue
        if primary!=tag and (proposals or primary not in tag):
            continue
        level = 1 if role == "mainbrand" else 2
        forms = subject_forms(name)
        proposals.append((len(primary)*3+(100 if primary==tag else 0),
                          {"subject":name,"level":level,"anchors":sorted(forms),"basis":"explicit topic and role in plan"}))
    if not proposals:
        return None,"SCOPE_UNCLEAR"
    proposals.sort(key=lambda pair:pair[0], reverse=True)
    highest, choice = proposals[0]
    if highest < 2:
        # A distinct campaign can use a hashtag without a brand name. Require a
        # named topic on a plan hashtag row, then validate that brand in search.
        if len(tag) < 8 or not any(o["kind"]=="hashtag" and compact(o["subject"]) in choice["anchors"] for o in origins):
            return None, "SUBJECT_NOT_IN_HASHTAG"
        choice = {**choice,"basis":"named plan hashtag column + reviewed subject"}
    if any(other["level"]!=choice["level"] for score,other in proposals if score==highest):
        return None,"LEVEL_CONFLICT"
    return choice,None


def live_plan_hashtags(matrix_tabs):
    newer_diff = ROOT / "plan-refresh/coverage-current/compared-plans.json"
    diff = newer_diff if newer_diff.is_file() else ROOT / "plan-refresh/plan-diff.json"
    if not diff.is_file():
        return
    docs = json.loads(diff.read_text(encoding="utf8"))
    names = re.compile(r"keyword|\bkws?\b|tu[\s_-]*khoa|hashtag|^key(?: |$)", re.I)
    for doc in docs:
        if not doc["current_file"]:
            continue
        tab_names = matrix_tabs.get(doc["id"], set())
        for sheet in read_book(doc["current_file"], lambda name: (name in tab_names or names.search(fold(name))) and not OUTSIDE_SHEETS.search(name)):
            hashtag_columns = set()
            for _, row in sorted(sheet["rows"].items()):
                headers = {col for col, cell in row.items() if fold(cell["text"]) in {"hashtag","hashtags","hashtag keywords"}}
                if headers:
                    hashtag_columns = headers
                    continue
                for col, cell in row.items():
                    value=cell.get("text","")
                    in_column = col in hashtag_columns
                    if (not in_column and "#" not in value) or len(value) > 24_000:
                        continue
                    for hashtag in normalized_hashtags(value, in_column):
                        for project, status in doc["projects"]:
                            yield (project, hashtag, status, {"plan_url":doc["url"],"sheet":sheet["name"],"cell":cell["ref"],
                                                            "kind":"hashtag" if in_column else "live_plan_cell","subject":"","role":"","context":""})


def prepare(scan_live=False):
    db = connect()
    try:
        statuses = dict(db.execute("SELECT project_name,plan_status FROM projects"))
        anchors = defaultdict(list)
        for p,q,l,subjects in db.execute("""SELECT project_name,keyword,level,subjects_json FROM keywords
                                            WHERE status='READY' AND keyword NOT LIKE '#%'"""):
            forms = subject_forms(q)
            for subject in json.loads(subjects):
                if (subject_fold:=compact(subject)) and len(subject_fold)>=4:
                    forms |= subject_forms(subject)
            if forms:
                anchors[p].append({"subject":q,"level":l,"anchors":sorted(forms),"basis":"reviewed keyword/topic in project"})
        for p in statuses:
            # Project names with a strong brand component help recover first
            # primary terms, but broad role prefixes need an approved topic.
            candidate = re.sub(r"\s+(?:20\d\d|ms)$","",re.split(r"\s+[-–]\s+|\(",p)[0],flags=re.I).strip()
            if len(compact(candidate))>=4 and fold(candidate).split()[0] not in {"nganh","campaign","du","tin","chu"}:
                anchors[p].append({"subject":candidate,"level":1,"anchors":sorted(subject_forms(candidate)),"basis":"project name in master plan"})
        inventory = {}
        for project,kind,value,url,sheet,cell,row_json in db.execute("""SELECT project_name,kind,raw_value,plan_url,sheet,cell,row_json
                      FROM es_keyword_cells WHERE instr(raw_value,'#')>0 OR lower(kind)='hashtag'"""):
            raw = json.loads(row_json)
            for hashtag in normalized_hashtags(value or "", kind=="hashtag"):
                key = (project,hashtag.casefold())
                item = inventory.setdefault(key,{"project":project,"keyword":hashtag,"project_status":statuses.get(project),"origins":[]})
                origin = {"plan_url":url,"sheet":sheet,"cell":cell,"kind":kind,"subject":raw.get("subject") or raw.get("topic") or "",
                          "role":raw.get("roleOriginal") or "", "context":(raw.get("mainContext") or "")[:180]}
                if origin not in item["origins"]:
                    item["origins"].append(origin)
        workbook_cache = ROOT / "latest-plan-hashtag-cells.json"
        if scan_live:
            matrix_tabs=defaultdict(set)
            for url, name in db.execute("SELECT DISTINCT plan_url,sheet FROM es_keyword_cells WHERE kind='hashtag'"):
                if doc_id := re.search(r"/d/([\w-]+)", url or ""):
                    if not re.search(r"phan quyen|mat khau|credential|account access|password",fold(name)):
                        matrix_tabs[doc_id[1]].add(name)
            workbook_cache.write_text(json.dumps(list(live_plan_hashtags(matrix_tabs)),ensure_ascii=False),encoding="utf8")
        if workbook_cache.is_file():
            for project, hashtag, status, origin in json.loads(workbook_cache.read_text(encoding="utf8")):
                item = inventory.setdefault((project,hashtag.casefold()),
                                            {"project":project,"keyword":hashtag,"project_status":statuses.get(project,status),"origins":[]})
                if not any(o["sheet"]==origin["sheet"] and o["cell"]==origin["cell"] for o in item["origins"]):
                    item["origins"].append(origin)
        for item in inventory.values():
            project = item["project"]
            good = [o for o in item["origins"] if (o["kind"] not in {"exclude","negative"} and not OUTSIDE_SHEETS.search(o["sheet"])
                    and not (project in SCOPE_BLOCKS and SCOPE_BLOCKS[project].search(o["sheet"])))]
            if not good:
                item["status"]="EXCLUDED_PLAN_CONTEXT"
                continue
            if any(o["kind"]=="exclude" for o in item["origins"]):
                item["status"]="EXCLUDED_IN_PLAN"
                continue
            mapping, reason = locate_subject(project,item["keyword"],good,anchors)
            if mapping:
                item["topic"]=mapping
                item["qualified_origins"]=good
                item["status"]="SEARCH"
            else:
                item["status"]=reason
        rows = list(inventory.values())
        INVENTORY.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding="utf8")
        print(encode({"candidates":len(rows),"decisions":dict(Counter(x["status"] for x in rows)),
                      "unique_to_search":len({x["keyword"].casefold() for x in rows if x["status"]=="SEARCH"})}),flush=True)
    finally:
        db.close()


def walk(x):
    stack=[x]
    while stack:
        value=stack.pop()
        if isinstance(value,dict):
            yield value
            stack.extend(reversed(tuple(value.values())))
        elif isinstance(value,list):
            stack.extend(reversed(value))


def blob(value):
    if not isinstance(value,dict):
        return ""
    if value.get("simpleText"):
        return str(value["simpleText"])
    return " ".join(str(r.get("text","")) for r in value.get("runs",[])).strip()


def get_page(key):
    query = key if key.startswith("#") else "#"+key
    url = "https://www.youtube.com/hashtag/"+quote(query[1:],safe="")+"?hl=vi&gl=VN"
    row = {"keyword":query,"url":url,"checked_at":datetime.now(timezone.utc).isoformat(),"platform":"YouTube"}
    try:
        request = Request(url, headers={"User-Agent":"Mozilla/5.0","Accept-Language":"vi,en;q=0.8","Accept-Encoding":"gzip"})
        with urlopen(request,timeout=18) as response:
            if not response.url.startswith("https://www.youtube.com/hashtag/"):
                return {**row,"status":"REDIRECT"}
            data = response.read(4_000_001)
            if response.headers.get("Content-Encoding") == "gzip":
                data = gzip.decompress(data)
        page = data.decode("utf8","replace")
        start = re.search(r"(?:var\s+)?ytInitialData\s*=\s*(?=\{)", page)
        if not start:
            return {**row,"status":"NO_PUBLIC_DATA"}
        data, _ = json.JSONDecoder().raw_decode(page[start.end():])
        headers = [n.get("pageTitle") for n in walk(data.get("header",{})) if str(n.get("pageTitle","")).startswith("#")]
        if not headers or all(unicodedata.normalize("NFC", h).casefold()!=query.casefold() for h in headers):
            return {**row,"status":"NO_EXACT_HASHTAG_HEADER"}
        results = {}
        for obj in walk(data.get("contents",{})):
            for field in ("videoRenderer","compactVideoRenderer","gridVideoRenderer","reelItemRenderer","shortsLockupViewModel"):
                entry = obj.get(field)
                if not isinstance(entry,dict):
                    continue
                id = entry.get("videoId")
                if field=="shortsLockupViewModel":
                    id = entry.get("onTap",{}).get("innertubeCommand",{}).get("reelWatchEndpoint",{}).get("videoId")
                title = blob(entry.get("title") or entry.get("headline")) or (
                    entry.get("overlayMetadata",{}).get("primaryText",{}).get("content",""))
                owner = blob(entry.get("ownerText") or entry.get("longBylineText") or entry.get("shortBylineText"))
                description = blob(entry.get("descriptionSnippet"))
                if id and title and re.fullmatch(r"[\w-]{11}",id):
                    results[id] = {"video_id":id,"title":title,"channel":owner,"description":description[:200]}
        return {**row,"status":"OK","results":list(results.values())[:20]}
    except HTTPError as e:
        return {**row,"status":f"HTTP_{e.code}"}
    except (URLError,TimeoutError,OSError,ValueError) as e:
        return {**row,"status":"READ_ERROR","error":type(e).__name__}


def observation_map():
    if not FETCHED.is_file():
        return {}
    data = FETCHED.read_text(encoding="utf8")
    observations = {x["keyword"].casefold():x for x in map(json.loads,data[:data.rfind("\n")+1].splitlines())}
    vinmec = ROOT / "plan-refresh/vinmec-hashtag-observations.json"
    if vinmec.is_file():
        observations.update(json.loads(vinmec.read_text(encoding="utf8")))
    return observations


def run_fetch():
    candidates = json.loads(INVENTORY.read_text(encoding="utf8"))
    latest = observation_map()
    missing = {}
    for row in sorted(candidates,key=lambda x:x["project_status"]=="stop"):
        if row["status"]=="SEARCH" and row["keyword"].casefold() not in latest:
            missing.setdefault(row["keyword"].casefold(),row["keyword"])
    with FETCHED.open("a",encoding="utf8") as handle, ThreadPoolExecutor(max_workers=4) as pool:
        pending = iter(missing.values())
        count=0
        # Small groups keep total load bounded and stop when the public service rate-limits.
        while chunk := [x for _,x in zip(range(8),pending)]:
            batch = [pool.submit(get_page,x) for x in chunk]
            limited=False
            for future in as_completed(batch):
                row=future.result()
                handle.write(encode(row)+"\n")
                handle.flush()
                limited |= row["status"]=="HTTP_429"
                count+=1
            if count%40==0 or limited or count==len(missing):
                print(f"{count}/{len(missing)} hashtag pages checked",flush=True)
            if limited:
                break
            time.sleep(0.45)


def proof_hits(topic, results, approved_channels):
    anchors = set(topic["anchors"])
    matches = []
    for row in results:
        title = TAG.sub(" ",row["title"])
        description = TAG.sub(" ",row["description"])
        owner = row["channel"]
        names = [fold(v) for v in (title,owner,description)]
        phrases=set(names)
        compact_names=[v.replace(" ","") for v in names]
        tokens={token for name in names for token in name.split()}
        if owner in approved_channels or any((len(a)>=5 and any(a in s for s in compact_names)) or
                                             (len(a)<5 and (a in tokens or a in phrases)) for a in anchors):
            matches.append(row)
    return matches


def assess():
    candidates=json.loads(INVENTORY.read_text(encoding="utf8"))
    observed=observation_map()
    reviews=[]
    for row in candidates:
        review={**row}
        if row["status"]!="SEARCH":
            reviews.append(review)
            continue
        observation=observed.get(row["keyword"].casefold())
        if not observation or observation["status"]!="OK":
            review["decision"]=observation["status"] if observation else "NOT_CHECKED"
            reviews.append(review)
            continue
        results=observation["results"]
        approved_channels=CHANNEL_EVIDENCE.get((row["project"],row["topic"]["subject"]),{})
        hits=proof_hits(row["topic"],results,approved_channels)
        review["decision"]="ACCEPTED" if len(hits)>=3 and len(hits)*100>=70*len(results) else "INSUFFICIENT_OR_MIXED"
        reason=MIXED_SEARCH_TAGS.get((row["project"],row["keyword"].casefold()))
        if row["project"]=="Saint-gobain" and "mikado" in compact(row["keyword"]):
            reason = "Cần bằng chứng phân biệt gạch Mikado với tên trùng ngành ăn uống."
        if reason:
            review["decision"]="MIXED_OR_WRONG_SUBJECT"
            review["review_reason"]=reason
        review["search_check"]={"checked_at":observation["checked_at"],"url":observation["url"],"platform":"YouTube",
                                "sample_size":len(results),"matched_count":len(hits),
                                "matched_examples":[{**r,"url":"https://www.youtube.com/watch?v="+r["video_id"]} for r in hits[:5]],
                                "unmatched_examples": [r["title"] for r in results if r not in hits][:4]}
        if any(r["channel"] in approved_channels for r in hits):
            review["search_check"]["channel_evidence"]=approved_channels
        reviews.append(review)
    return reviews


def summary(reviews):
    good=[r for r in reviews if r.get("decision")=="ACCEPTED"]
    return {"plan_project_hashtag_rows":len(reviews),
            "observed_hashtag_searches":len(observation_map()),
            "decisions":dict(Counter(x.get("decision",x["status"]) for x in reviews)),
            "accepted_rows":len(good),
            "accepted_by_level_and_plan_status":{"{}".format(k):v for k,v in Counter((r["topic"]["level"],r["project_status"]) for r in good).items()}}


def apply(reviews):
    accepted=[r for r in reviews if r.get("decision")=="ACCEPTED"]
    db=connect()
    db.execute("PRAGMA foreign_keys=ON")
    counters=Counter()
    try:
        queue_before=db.execute("SELECT Level,count(*) FROM search_queue GROUP BY Level").fetchall()
        with db:
            for row in accepted:
                p, keyword, topic, sample=(row[k] for k in ("project","keyword","topic","search_check"))
                assert TAG.fullmatch(keyword) and sample["matched_count"]>=3
                level=topic["level"]
                state=db.execute("SELECT plan_status FROM projects WHERE project_name=?",(p,)).fetchone()
                if not state:
                    counters["project_missing"]+=1
                    continue
                project_status=state[0]
                evidences=[f"YouTube hashtag page ({sample['matched_count']}/{sample['sample_size']} matched first-page sample): {sample['url']}"]
                evidences.extend(f"YouTube: {example['title']} | {example['channel']} | {example['url']}" for example in sample["matched_examples"])
                evidences.extend(f"YouTube: kênh {channel} và chủ thể | {url}" for channel,url in sample.get("channel_evidence",{}).items())
                originals={"kind":"plan_hashtag", "exact_keyword":keyword,"plan_cells":row["qualified_origins"],"topic_resolution":topic,
                           "hashtag_search":sample}
                exists=db.execute("SELECT 1 FROM keywords WHERE project_name=? AND keyword=? COLLATE NOCASE",(p,keyword)).fetchone()
                if exists:
                    counters["already_in_catalog"]+=1
                    continue
                db.execute("INSERT INTO keywords VALUES (?,?,?,?,?,?,?,?,?)",
                           (keyword,p,level,"READY",project_status,encode([topic["subject"]]),encode(evidences),encode([originals]),
                            encode(["Có hashtag nguyên dạng trong plan và mẫu kết quả tìm theo đúng hashtag trên YouTube khớp chủ thể.",
                                    "Bằng chứng này dùng cho YouTube; các nền tảng khác được giữ tình trạng chưa kiểm tra."])))
                db.execute("INSERT INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)",
                           (AUDIT_ID,p,keyword,None,"READY",None,level,None,"Hashtag đứng độc lập. Chủ thể và Level đối chiếu plan."))
                counters[f"level_{level}_{'paused' if project_status.casefold()=='stop' else 'ready'}"]+=1
            queue_after=db.execute("SELECT Level,count(*) FROM search_queue GROUP BY Level").fetchall()
            applied={"checked_at":datetime.now(timezone.utc).isoformat(),"added":dict(counters),
                     "queue_before":[list(r) for r in queue_before],"queue_after":[list(r) for r in queue_after],
                     "hashtags_in_queue":db.execute("SELECT count(*) FROM search_queue WHERE Keyword LIKE '#%'").fetchone()[0],
                     "distinct_search_terms":db.execute("SELECT count(*) FROM search_terms").fetchone()[0]}
            db.execute("INSERT OR REPLACE INTO catalog_metadata VALUES (?,?)",("hashtag_review",encode(applied)))
            assert not db.execute("PRAGMA foreign_key_check").fetchall()
            assert db.execute("SELECT count(*) FROM search_queue WHERE ProjectName='M-Village' AND lower(Keyword) LIKE '#vinwonders%'").fetchone()[0]==0
            assert db.execute("SELECT count(*) FROM search_queue WHERE ProjectName='Saint-gobain' AND lower(Keyword) LIKE '#xanhsm%'").fetchone()[0]==0
        assert db.execute("PRAGMA quick_check").fetchone()[0]=="ok"
        return applied
    finally:
        db.close()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("mode",choices=["prepare","fetch","review","apply"])
    parser.add_argument("--scan-live",action="store_true")
    args=parser.parse_args()
    if args.mode=="prepare":
        prepare(args.scan_live)
    elif args.mode=="fetch":
        run_fetch()
    else:
        reviews=assess()
        result=summary(reviews)
        if args.mode=="apply":
            result["applied"]=apply(reviews)
        REPORT.write_text(json.dumps({"summary":result,"records":reviews},ensure_ascii=False,indent=2)+"\n",encoding="utf8")
        print(encode(result))


if __name__=="__main__":
    main()
