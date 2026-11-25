"""Apply review decisions tied to specific cells, using current plan exports."""
import argparse
from collections import Counter, defaultdict
import json
import sqlite3

from audit_catalog_search_keywords import DB, ROOT, compact, encode
from extract_project_sources import read_book

PLAN_ROOT = ROOT / "plan-refresh"
CURRENT = PLAN_ROOT / "coverage-current" / "public-plans"
AUDIT_ID = "2026-11-19-full-keyword-coverage"
REPORT = PLAN_ROOT / "keyword-coverage-review.json"

# Each row names the project, the originating sheet, the catalog level,
# and the exact cell for each reviewed, independently usable term.
SELECTION = [
    ("Lazada", "3. Keywords", 1, [("D8","Lazada")]),
    ("VinaCapital", "Keywords for BHC", 1, [("D8","VinaCapital")]),
    ("VinaCapital", "Keywords for BHC", 2, [("D125","VCBF")]),
    ("ACBS - Báo Cáo Năm 2026", "Từ khóa (6 đối thủ)", 2, [
        ("B6","TCBS"),("B16","Chứng khoán SSI"),("B29","VPS Securities"),
        ("B41","Chứng khoán Vietcap"),("B46","Chứng khoán MB"),("B54","Chứng khoán HSC")]),
    ("ACBS - Báo Cáo Năm 2025", "Từ khóa (đối thủ)", 2, [
        ("B7","VPBank Securities"),("E7","Chứng khoán KIS Việt Nam"),("B34","TCBS"),("E35","Chứng khoán HSC"),
        ("B48","Chứng khoán VietinBank"),("E47","Chứng khoán SHS"),("E63","Chứng khoán Mirae Asset"),
        ("E74","VietCapital Securities"),("B87","Chứng khoán MB"),("E87","Chứng khoán DNSE")]),
    ("ACBS - Báo Cáo Năm 2025", "List đối thủ", 2, [("C6","SSI"),("E6","BSI"),("J6","VPS"),("M6","Kafi")]),
    ("HDBank", "Danh sách từ khóa", 1, [("B32","HD SAISON"),("B36","Sovico")]),
    ("Tasco", "Updated_Từ khóa", 1, [("C23","BYD Việt Nam"),("D29","Lotus Cars")]),
    ("Be App", "Keyword List", 1, [("C70","Ngân hàng số Cake")]),
    ("Chance Kim", "Trang tính1", 2, [("B10","TL Beauty Center"),("B17","Thương Nguyễn Eyebrows")]),
    ("FPT Shop 2026", "Trang tính1", 2, [
        ("B17","Thế Giới Di Động"),("B28","CellphoneS"),("B39","Hoàng Hà Mobile"),("B44","Điện Máy Xanh"),("B50","TopZone")]),
    ("Hanwha Life Insurance 2026", "Trang tính1", 2, [
        ("A12","Dai-ichi Life Việt Nam"),("B42","AIA Việt Nam"),("B84","FWD Việt Nam"),("B94","Cathay Việt Nam")]),
    ("Suzuki 2026", "Keyword & Source", 2, [
        ("C21","Mitsubishi Motors"),("C39","Geely"),("C47","BYD"),("C51","Omoda"),("C57","MG Motor")]),
    ("Masterise Homes 2026", "Trang tính1", 1, [
        ("B4","Masterise Group"),("B13","Lumière Riverside"),("B23","Masteri An Phú")]),
    ("Masterise Homes 2026", "Trang tính1", 2, [
        ("B27","Ecopark"),("B42","Khang Điền"),("B40","Verosa Park"),("B41","Lovera Vista"),("B45","Melosa Garden"),
        ("B48","Rosita Garden"),("B49","The Classia Khang Điền"),("B52","Gladia by the Waters"),("B53","Gladia Heights")]),
    ("Hưng Lộc Phát", "Từ khóa", 1, [
        ("C25","The Peak Garden"),("C16","Mũi Né Summerland"),("C17","Hưng Phát Green Star"),("C18","The Golden Star"),
        ("C19","Hưng Phát Silver Star"),("C20","Hưng Phát Building"),("C22","Hưng Lộc Phát Complex"),("C23","Hưng Phát 6")]),
    ("Central Retail", "Keywords - Mainbrand", 1, [("P5","LookKool"),("V8","Robins Royal City"),("AB5","BIPBIP")]),
    ("Samsung 2026", "Trang tính1", 1, [
        ("B3","Galaxy A57"),("B4","Galaxy A27"),("B5","Galaxy A37"),("B6","Galaxy A07"),("B7","Galaxy A17"),("B8","Galaxy S26"),
        ("B9","Galaxy AI"),("B11","Galaxy Unpacked"),("B15","Neo QLED"),("B26","Samsung Odyssey"),("B29","ViewFinity"),
        ("B33","Bespoke AI"),("B34","Bespoke Jet"),("B36","EcoBubble"),("B38","WindFree"),("B56","Galaxy Z Fold8"),("B68","Galaxy Tab S11 Ultra")]),
    ("Samsung 2026", "Trang tính1", 2, [
        ("B130","smart tivi"),("B133","Android TV"),("B135","Google TV"),("B138","tivi OLED"),("B140","tivi Mini LED"),
        ("B142","loa thanh"),("B143","máy chiếu"),("B144","Bravia"),("B147","OLED evo"),("B148","QNED"),("B149","NanoCell"),
        ("B154","màn hình máy tính"),("B156","màn hình gaming"),("B157","màn hình đồ họa"),("B160","màn hình ultrawide"),
        ("B172","LG UltraGear"),("B166","ROG Swift"),("B167","ZenScreen"),("B169","MSI Optix"),("B170","BenQ Mobiuz"),
        ("B175","máy giặt sấy"),("B176","máy sấy quần áo"),("B177","máy rửa bát"),("B179","máy lọc không khí"),
        ("B180","robot hút bụi"),("B181","InstaView"),("B186","Econavi"),("B187","TurboWash"),("B188","UltimateCare"),
        ("B189","tủ lạnh"),("B190","máy giặt"),("B191","điều hòa"),("B193","lò vi sóng"),("B194","lò nướng"),("B195","máy hút bụi")]),
    ("Sabeco", "Trang tính1", 1, [
        ("A3","Bia Sài Gòn"),("A7","Saigon Special"),("A9","Saigon Export"),("A11","Saigon Lager"),("A13","Saigon Chill"),
        ("A15","Saigon Gold"),("A19","Bia 333"),("A20","Bia Lạc Việt")]),
    ("Sabeco", "Trang tính1", 2, [
        ("A49","Heineken"),("A53","Tiger Beer"),("A62","Bia Larue"),("A65","Bivina"),("A66","Strongbow"),("A67","Desperados"),
        ("A68","Amstel"),("A87","Bia Việt"),("A95","Carlsberg"),("A96","Tuborg"),("A98","Bia Huda"),("A105","Bia Halida"),
        ("A129","Habeco"),("A130","Bia Hà Nội"),("A133","Bia Trúc Bạch"),("A147","Sapporo Việt Nam"),("A163","Masan Brewery"),
        ("A166","Bia Red Ruby"),("A168","Bia Sư Tử Trắng"),("A169","Bia Trái Cây LUSH")]),
    ("CC1 - Smartcom", "PL - Đối tượng theo dõi", 1, [
        ("C5","Công ty Cổ phần Xây dựng Số 1 Việt Quang"),("C11","Công ty TNHH Hoa Hướng Dương Sài Gòn"),
        ("C13","Công ty Cổ phần Xây dựng Số 1 Việt Hưng"),("C25","Công ty CP Đầu tư Xây dựng số 14 (CC14)")]),
    ("ILA", "2. Keywords (2026)", 2, [("K90","DOL Đình Lực"),("K124","Ocean Edu"),("K139","I Can Read")]),
    ("ACV - Tổng Công ty cảng hàng không Việt Nam", "Đối tượng nghiên cứu", 2, [("B9","Cục Hàng không Việt Nam")]),
    ("TTC Group MS", "Keywords TTC & competitors", 1, [("B12","Công ty CP Điện Gia Lai"),("C48","DHA Healthcare")]),
    ("Masan", "Competitor Keywords", 2, [("D5","Techcombank"),("D29","Tập đoàn Dabaco"),("D41","Trung Thành Foods"),
        ("D52","Vifon"),("D70","Trung Nguyên G7"),("D74","Café Phố")]),
    ("Masan", "Mainbrand Keywords", 1, [("D13","Masan High-Tech Materials"),("D33","Chin-su")]),
    ("Hưng Thịnh Corp", "Từ khóa", 1, [("K5","Hưng Thịnh Innovation")]),
    ("Vinmec", "Thai Sản", 2, [("C58","thai nhi"),("C63","nhau thai")]),
]
AUTHORITY = {
    ("Lazada","Lazada"):"https://www.lazada.vn/",
    ("VinaCapital","VinaCapital"):"https://vinacapital.com/vi/investment-solutions/",
    ("VinaCapital","VCBF"):"https://www.vcbf.com/index.php?m=gioi-thieu-cong-ty",
}

ALIAS_CORRECTIONS = (
    ("Masterise Homes 2026", "Masteri Park Land", "Lumière Riverside",
     "Tên cũ của cùng dự án Lumière Riverside.", "https://masterisehomes.com/lumiere-riverside/"),
    ("TTC Group MS", "Điện Gia Lai GEC", "Công ty CP Điện Gia Lai",
     "Cùng công ty Điện Gia Lai trong tab Keywords TTC & competitors.", None),
    ("C.P Việt Nam (SmartCom)", "C.P Việt Nam", "C.P. Việt Nam",
     "Cùng một thương hiệu, gộp biến thể dấu chấm.", None),
    ("LG", "LG Vietnam", "LG Việt Nam", "Tên tiếng Anh của cùng thương hiệu trong project.", None),
)
CONFIRMED_REVIEW = {
    ("MSG", "Bệnh viện Mắt Sài Gòn"):"https://www.matsaigon.com/thong-bao-chinh-thuc-nhan-dien-thuong-hieu-va-danh-sach-he-thong-benh-vien-mat-sai-gon/",
    ("Hưng Thịnh Corp", "Hung Thinh Investment"):"https://hungthinhcorp.com.vn/lien-he.html",
    ("Unilever_Pitch", "nước mắm Chin-su"):"https://masanconsumer.com/san-pham/thuong-hieu/chin-su/",
}
PUBLIC_EVIDENCE = {
    ("Hưng Thịnh Corp","Hưng Thịnh Innovation"):"https://www.hungthinhcorp.com.vn/lien-he.html",
    ("Masterise Homes 2026","Lumière Riverside"):"https://masterisehomes.com/lumiere-riverside/",
    **{("Samsung 2026",f"Galaxy {model}"):"https://www.samsung.com/us/support/answer/ANS10010489/"
       for model in ("A17","A27","A37","A57")},
}


def sheets_by_project(documents, names):
    index = defaultdict(list)
    for doc in documents:
        projects = [p for p,s in doc["projects"] if s != "stop" and p in names]
        if not projects:
            continue
        candidates = {name for project in projects for name in names[project]}
        if not doc["current_file"]:
            continue
        for sh in read_book(doc["current_file"], candidates.__contains__):
            for project in projects:
                if sh["name"] in names[project]:
                    index[project, sh["name"]].append((doc["url"], sh))
    return index


def checked_rows(documents):
    names = defaultdict(set)
    for project, sheet, _, _ in SELECTION:
        names[project].add(sheet)
    names["KAO Việt Nam"].add("Keyword")
    names["Nestlé"].add("Keywords ")
    sheets = sheets_by_project(documents, names)
    rows, rejected = [], []
    for project, name, level, pairs in SELECTION:
        for ref, keyword in pairs:
            # Match accented/spacing variants and terms separated in a raw cell.
            canonical = compact(keyword)
            for url, sheet in sheets[project, name]:
                cell = next((c for row in sheet["rows"].values() for c in row.values() if c["ref"] == ref), None)
                if not cell:
                    continue
                actual = cell["text"].strip()
                source_text = compact(actual)
                if canonical != source_text and not (len(canonical) >= 5 and canonical in source_text):
                    continue
                rows.append((project, keyword, level, {"plan_url":url,"sheet":name,"cell":ref,"raw_value":actual}))
                break
            else:
                rejected.append([project,name,ref,keyword])
    return rows, rejected, sheets


def update_raw(db, project, books, kinds, first_row):
    count = 0
    for url, sheet in books:
        name = sheet["name"]
        for n, row in sorted(sheet["rows"].items()):
            if n < first_row:
                continue
            for col, cell in row.items():
                raw = cell["text"].strip()
                if not raw or col not in kinds:
                    continue
                kind = kinds[col]
                ref = cell["ref"]
                origin = {"project":project,"planUrl":url,"sheet":name,"cell":ref,"kind":kind,"value":raw,
                          "subject":project,"roleOriginal":"Mainbrand"}
                count += db.execute("""INSERT INTO es_keyword_cells
                    SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS
                    (SELECT 1 FROM es_keyword_cells WHERE project_name=? AND plan_url=? AND sheet=? AND cell=?)""",
                    (project,kind,raw,url,name,ref,encode(origin),project,url,name,ref)).rowcount
    return count


def apply(db, rows):
    statuses = dict(db.execute("SELECT project_name,plan_status FROM projects"))
    existing = {(p, k.casefold()): (k, l, s, ev, orig, why) for p,k,l,s,ev,orig,why in db.execute(
        "SELECT project_name,keyword,level,status,evidence_json,originals_json,reasons_json FROM keywords")}
    counts = Counter()
    for project, keyword, level, origin in rows:
        current = existing.get((project, keyword.casefold()))
        if current and current[1] == level and current[2] == "READY":
            continue
        if current and current[2] not in {"READY", "REVIEW"}:
            continue
        evidence, originals, reasons = (map(json.loads, current[3:]) if current else ([], [], []))
        evidence.append(f"Plan {origin['sheet']}!{origin['cell']}: {origin['plan_url']}")
        if official := AUTHORITY.get((project, keyword)):
            evidence.append(official)
        reason = "Đối chiếu ô nguồn và vai trò theo plan. Cụm dùng được để tìm riêng."
        args = (level,statuses[project],encode([keyword]),encode(evidence),encode([*originals,origin]),encode([*reasons,reason]))
        if current:
            name = current[0]
            db.execute("UPDATE keywords SET level=?,status='READY',project_status=?,subjects_json=?,evidence_json=?,"
                       "originals_json=?,reasons_json=? WHERE project_name=? AND keyword=?", (*args,project,name))
        else:
            name = keyword
            db.execute("INSERT INTO keywords VALUES (?,?,?,'READY',?,?,?,?,?)", (name,project,*args))
        db.execute("INSERT INTO keyword_quality_audit VALUES (?,?,?,?,'READY',?,?,NULL,?)",
                   (AUDIT_ID,project,name,current[2] if current else None,current[1] if current else None,level,reason))
        counts[project] += 1
    return dict(counts)


def correct_aliases(db):
    audit = AUDIT_ID + "-aliases"
    for project, word, replacement, reason, authority in ALIAS_CORRECTIONS:
        current = db.execute("SELECT level,status,evidence_json,reasons_json FROM keywords WHERE project_name=? AND keyword=?",
                             (project,word)).fetchone()
        target = db.execute("SELECT 1 FROM keywords WHERE project_name=? AND keyword=? AND status='READY'",
                            (project,replacement)).fetchone()
        if not current or current[1] == "ALIAS" or not target:
            continue
        evidence = json.loads(current[2])
        if authority:
            evidence.append(authority)
        db.execute("UPDATE keywords SET status='ALIAS',evidence_json=?,reasons_json=? WHERE project_name=? AND keyword=?",
                   (encode(evidence),encode([*json.loads(current[3]),reason]),project,word))
        db.execute("INSERT INTO keyword_quality_audit VALUES (?,?,?,?,'ALIAS',?,?,?,?)",
                   (audit,project,word,current[1],current[0],current[0],replacement,reason))
    old = "Thế giới di động"
    new = "Thế Giới Di Động"
    for project, level, status, original in db.execute(
        "SELECT project_name,level,status,originals_json FROM keywords WHERE keyword=? AND status='READY'", (old,)
    ).fetchall():
        reason = "Chuẩn hoá cách viết cùng tên để search_terms gộp đúng qua nhiều project."
        originals = json.loads(original)
        originals.append({"previous_keyword":old,"reason":reason})
        db.execute("UPDATE keywords SET keyword=?, originals_json=? WHERE project_name=? AND keyword=?",
                   (new,encode(originals),project,old))
        db.execute("INSERT INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)",
                   (audit,project,old,status,status,level,level,new,reason))
    for (project, word), url in PUBLIC_EVIDENCE.items():
        current = db.execute("SELECT evidence_json FROM keywords WHERE project_name=? AND keyword=?", (project,word)).fetchone()
        if current and url not in (ev := json.loads(current[0])):
            db.execute("UPDATE keywords SET evidence_json=? WHERE project_name=? AND keyword=?",
                       (encode([*ev,url]),project,word))


def resolve_review(db):
    for (project, word), url in CONFIRMED_REVIEW.items():
        row = db.execute("SELECT level,evidence_json,reasons_json FROM keywords "
                         "WHERE project_name=? AND keyword=? AND status='REVIEW'", (project,word)).fetchone()
        if not row:
            continue
        level, evidence, reasons = row
        reason = "Tên đã có trong plan và được đối chiếu với trang chính thức của đúng chủ thể."
        db.execute("UPDATE keywords SET status='READY',evidence_json=?,reasons_json=? WHERE project_name=? AND keyword=?",
                   (encode([*json.loads(evidence),url]),encode([*json.loads(reasons),reason]),project,word))
        db.execute("INSERT INTO keyword_quality_audit VALUES (?,?,?,'REVIEW','READY',?,?,NULL,?)",
                   (AUDIT_ID,project,word,level,level,reason))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    docs = json.loads((CURRENT.parent / "compared-plans.json").read_text(encoding="utf8"))
    rows, skipped, sheets = checked_rows(docs)
    report = {"candidate_rows":len(rows), "skipped_cells":skipped}
    if args.apply:
        with sqlite3.connect(DB.resolve().as_uri()+"?mode=rw", uri=True) as db:
            db.execute("PRAGMA foreign_keys=ON")
            db.execute("BEGIN IMMEDIATE")
            report["applied"] = apply(db, rows)
            report["kao_raw_rows_added"] = update_raw(db,"KAO Việt Nam",sheets["KAO Việt Nam","Keyword"],
                {"B":"main", **dict.fromkeys("CDEFG","sub"), **dict.fromkeys("HIJK","exclude")},2)
            report["nestle_raw_rows_added"] = update_raw(db,"Nestlé",sheets["Nestlé","Keywords "],
                {"C":"main","D":"sub","E":"hashtag"},11)
            correct_aliases(db)
            resolve_review(db)
            report["raw_rows_archived"] = dict(db.execute("""SELECT project_name, count(*) FROM es_keyword_cells
                WHERE (project_name='KAO Việt Nam' AND sheet='Keyword') OR (project_name='Nestlé' AND sheet='Keywords ')
                GROUP BY project_name"""))
            report["plain_changes_across_reruns"] = dict(db.execute(
                "SELECT project_name,count(*) FROM keyword_quality_audit WHERE audit_id=? GROUP BY project_name",(AUDIT_ID,)))
            assert not db.execute("PRAGMA foreign_key_check").fetchall()
            report["ready_by_level"] = db.execute("SELECT Level,count(*) FROM search_queue GROUP BY Level").fetchall()
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print(encode(report))


if __name__ == "__main__":
    main()
