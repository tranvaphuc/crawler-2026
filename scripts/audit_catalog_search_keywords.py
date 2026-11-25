"""Review catalog keyword scope and evidence without calling paid APIs or executing searches."""
import argparse
import collections
from datetime import datetime, timezone
import json
import re
import sqlite3
import unicodedata
from pathlib import Path

ROOT = Path("outputs/source-keyword-catalog-2026-11-19")
DB = ROOT / "source-keyword-catalog.sqlite"
AUDIT = "2026-11-19-search-keyword-review"

M_VILLAGE_URL = "https://docs.google.com/spreadsheets/d/1TFUv1bfBC4Ic7ealb7wxc3P7rscO9Q-n/edit?gid=1261856513"
LG_URL = "https://www.lg.com/vn/"
CP_URL = "https://www.cp.com.vn/"
BVB_URL = "https://bvbank.net.vn/tin-tuc/ngan-hang-ban-viet-cong-bo-ten-viet-tat-tieng-anh-moi-bvbank/"

OUT_OF_SCOPE = {
    ("Saint-gobain", "Mikado sushi"): "Plan Từ khóa Vĩnh Tường & đối thủ!B149/E149 ghi Mikado ngành vật liệu và loại trừ sushi. Dùng gạch Mikado đã có.",
    ("Hưng Lộc Phát", "ILA"): "Roster Sheet1 dòng 35 thuộc project và ID ILA; plan Hưng Lộc Phát chỉ xác nhận Hưng Lộc Phát ở Từ khóa!B5:C6.",
    ("CapitaLand", "Shopee"): "Roster Sheet1 dòng 631–632 thuộc Shopee; nhãn Shopee group/non-group không phải chủ thể CapitaLand.",
    ("Philip Morris MS", "nghị định xăng dầu"): "Keyword!B2 là điều kiện Title về nghị định/nghị quyết và thuế; bằng chứng cũ là xăng dầu, không khớp phạm vi.",
    ("ShopeeFood", "Be Group"): "Tracking Keyword (2026)!A8 là BeFood. Be Group chung bao gồm các mảng ngoài giao đồ ăn.",
    ("ShopeeFood", "Xanh SM"): "Tracking Keyword (2026)!A9 là Green SM Food. Xanh SM chung kéo cả taxi và xe máy.",
    ("Panasonic", "máy lọc nước Panasonic"): "Topic cũ chỉ ghi Water purifier. Cần xác nhận phạm vi trước khi gán sản phẩm Panasonic.",
    ("Golden Gate Group", "nhà hàng Mangetsu"): "Bằng chứng ghi buffet Yuchu và các nội dung khác; cần xác nhận tên, đúng thực thể Magnetsu/Mangetsu.",
    ("Masan", "dầu ăn Tường An"): "Topic plan ghi Nước mắm Tường An, nhưng bằng chứng là dầu ăn; cần xác nhận dòng hàng.",
}

ES_FILTERS = {
    "Panasonic": {"máy giặt Panasonic", "thiết bị nhà bếp Panasonic", "tủ lạnh Panasonic", "điều hòa Panasonic"},
    "Vinamilk": {"Bột Dinh Dưỡng Vinamilk", "bột ăn dặm Vinamilk", "Kem Vinamilk", "Nước giải khát Vinamilk",
        "nước ép Vinamilk", "Phô mai Vinamilk", "Sữa Tươi Vinamilk", "Sữa bột Vinamilk", "Sữa bột Vinamilk Dinh Dưỡng",
        "sữa bột dinh dưỡng Vinamilk", "Sữa chua Vinamilk", "sữa chua Vinamilk đa vị", "sữa chua ít đường Vinamilk",
        "Sữa chua uống tươi Vinamilk", "sữa chua uống Vinamilk", "Sữa Đậu Nành Vinamilk", "sữa Vinamilk",
        "sữa dinh dưỡng Vinamilk", "sữa hạt Vinamilk", "Vinamilk Sữa hạt Cao Đạm", "Vinamilk Green Farm sữa chua uống",
        "Vinamilk Susu kem", "Vinamilk Susu sữa chua uống", "Vinamilk Susu sữa trái cây", "sữa chua ăn Susu Vinamilk",
        "Phô mai Vinamilk Susu",
        "sữa chua Nuvi", "Sữa chua uống Nestle Yogu"},
    "Masan": {"Masan MSN", "Masan MSR"},
    "C.P Việt Nam (SmartCom)": {"C.P. Việt Nam Về ăn cơm"},
    "Miss Cosmo 2026": {"Miss Cosmo nhà tài trợ"},
    "HDBank": {"ngành dịch vụ thanh toán"},
    "Home Credit": {"trả góp nhận tiền mặt"},
    "Zalopay": {"Xuất ngoại club Zalopay"},
}

# Explicit aliases only. Do not collapse distinct products because their names share a brand.
ALIASES = {
    ("ILA", "ila english center"): "ILA",
    ("NAB", "One Mount"): "One Mount Group",
    ("Masan", "Masan"): "Masan Group",
    ("LG", "TV Samsung"): "Samsung",
    ("Vinamilk", "Betagen Việt Nam"): "Betagen",
    ("Vinamilk", "Oatside Việt Nam"): "Oatside",
    ("Vinamilk", "Star Kombucha Việt Nam"): "Star Kombucha",
    ("Vinamilk", "sữa S26 Ultima"): "S26 Ultima",
    ("Vinamilk", "Sữa chua ăn Dalat Milk"): "Sữa chua Đà Lạt Milk",
}

NEEDS_REVIEW = {
    ("LG", "Bosch Global Software Technologies Vietnam"): "Kết quả về công ty phần mềm và tuyển dụng. Cần xác định topic LG theo dõi Bosch thiết bị gia dụng, doanh nghiệp công nghệ hay cả hai.",
    ("ShopeePay", "ví TikTok"): "Cần xác nhận sản phẩm ví nào; kết quả có thể là TikTok Shop hoặc nạp xu.",
    ("HDBank", "Nguyễn Thị Phương Thảo HDBank"): "Bằng chứng cũ mô tả Vietjet; cần kết quả trực tiếp gắn HDBank hoặc dùng tên chính để rà thủ công.",
    ("Gỗ An Cường", "gỗ HPL"): "HPL có thể là vật liệu High Pressure Laminate. Cần xác định brand HPL Group ở chủ thể của plan.",
    ("Golden Gate Group", "Quán Nhỏ"): "Tên quán chung, cần kết quả có địa chỉ hoặc dấu hiệu chuỗi trong plan.",
    ("Golden Gate Group", "Hẻm Quán Hà Nội"): "Tên mô tả rộng, cần đối chiếu đúng chuỗi Hẻm Quán.",
    ("Monte and ZOTT GOURMET CHEESE SLICE", "váng sữa cho bé"): "Cụm quá rộng và trùng phạm vi các chủ thể váng sữa đã có.",
    ("Enfa", "sữa công thức"): "Cụm ngành quá rộng để vào lượt search tự động; chỉ dùng khi có nhu cầu quét ngành.",
    ("NAPAS MS", "ngành dịch vụ thanh toán"): "Cụm ngành rộng, cần chọn phạm vi quét trước khi chạy tự động.",
    ("Tasco", "Vinfast"): "Updated_Từ khóa!G24 ghi chỉ lấy online news. Giữ tại catalog để dùng khi route search news.",
    ("Ngành tài chính", "nợ xấu Home Credit"): "Ghép thương hiệu và điều kiện sự vụ; cần rà phạm vi đợt quét ngành.",
    ("Ngành tài chính", "rút ví Home PayLater"): "Câu mô tả nghiệp vụ/sự vụ, cần rà riêng độ nhiễu trước khi chạy xuyên nền tảng.",
    ("Truong Son Land", "bất động sản Quy Nhơn"): "Cụm địa bàn và ngành rộng, thiếu tên dự án cụ thể để search tự động.",
    ("Vinamilk", "sữa A2 Platinum Premium"): "Bằng chứng và plan Enfa ghi sản phẩm cạnh tranh; roster Vinamilk để Level 1. Cần làm rõ vai trò trước khi chạy.",
    ("Vinamilk", "thị trường sữa Việt Nam"): "Chủ đề tin ngành cần chọn phạm vi quét; không gộp vào đợt thu thập KOL/brand.",
    ("Shopee", "Hannah Olala Candid"): "Crisis case có hai chủ thể. Bằng chứng cũ chỉ xác nhận Candid và chưa xác nhận quan hệ với case Hannah Olala.",
    ("Golden Gate Group", "nhà hàng Crystal Jade Palace"): "Phân biệt Crystal Jade Palace với Crystal Jade Kitchen được ghi Level 1. Cần kiểm tra đúng thương hiệu/mô hình kinh doanh.",
    ("Masan", "Mavin Hà Nam Tổ hợp chế biến thịt Mavin"): "Bằng chứng cũ chỉ xác nhận Tập đoàn Mavin, thiếu dấu hiệu về tổ hợp Hà Nam.",
}

VINMEC_OUTSIDE_MENTAL_HEALTH = {
    "rối loạn chuyển hóa", "rối loạn cương dương", "rối loạn kinh nguyệt", "rối loạn nhịp tim",
    "rối loạn nội tiết tố", "rối loạn tiêu hóa", "rối loạn tiền đình", "rối loạn xuất tinh", "rối loạn thần kinh",
}

LEVELS = {
    ("Petrolimex", "nghị định xăng dầu"): 2,
    ("Philip Morris MS", "bệnh do thuốc lá"): 2,
    ("Philip Morris MS", "ngành thuốc lá Việt Nam"): 2,
    ("Philip Morris MS", "thuế thuốc lá Việt Nam"): 2,
    ("Philip Morris MS", "thuốc lá điện tử Việt Nam"): 2,
    ("Ngành tài chính", "trả góp nhận tiền mặt"): 2,
    ("Shopee", "Sao Live Đỉnh Chóp"): 1,
}

# The prior shortlist preserved several misspellings or expanded an exact identity unnecessarily.
CANONICAL = {
    "ngân hàng Bản Việt": ("BVBank", BVB_URL),
    "Hoang Ha Mobile": ("Hoàng Hà Mobile", "https://hoanghamobile.com/"),
    "Cellphone S": ("CellphoneS", "https://cellphones.com.vn/"),
    "hanhphuchospital": ("Bệnh viện Quốc tế Hạnh Phúc", "https://www.hanhphuchospital.com/"),
    "hoan my hospital": ("Bệnh viện Hoàn Mỹ", "https://hoanmy.com/"),
    "nhà hàng Shogun Janpanese street BBQ": ("Shogun BBQ", None),
    "Golden Gate Việt Nam nhà hàng": ("Golden Gate Group", None),
    "váng sữa Mon Blanc": ("váng sữa Mont Blanc", None),
    "Thực phẩm chế biến Gkitchen": ("G Kitchen", None),
    "satra cj cầu tre": ("CJ Cầu Tre", None),
    "điện máy Chợ Lớn": ("Điện Máy Chợ Lớn", None),
    "Dnp holding": ("DNP Holding", None),
    "lottemart": ("LOTTE Mart", None),
    "bachhoaxanh": ("Bách Hóa Xanh", None),
    "viettelstore": ("Viettel Store", None),
    "Tổng công ty xây dựng CC1": ("Tổng Công ty Xây dựng Số 1 CC1", "https://www.cc1.vn/gioi-thieu-cc1/tong-quan.html"),
}

OFFICIAL_CONFIRMED = {
    ("Chance Kim", "Chance Kim"): "https://chancekim.com/gioi-thieu-ve-chance-kim",
    ("Tổ quốc trong tim mùa 2", "Tổ quốc trong tim mùa 2"): "https://nhandan.vn/truc-tiep-chuong-trinh-chinh-luan-nghe-thuat-to-quoc-trong-tim-mua-2-post983817.html",
    ("Central Retail", "Winmart"): "https://www.winmart.vn/info/about",
    ("LOTTE Properties HCMC", "Lotte Properties HCMC"): "https://www.phatdat.com.vn/en/news/phat-dat-made-1st-payment-of-more-than-vnd513-billion-for-the-lotte-eco-smart-city-thu-thiem-project",
}

KEEP_WITH_PLAN_EVIDENCE = {
    ("Bệnh Viện Quốc Tế Mỹ", "AIH"), ("Vinfast", "VinFast Motio"),
    ("Home Credit", "VietCredit"), ("Ngành tài chính", "VietCredit"), ("Ngành tài chính", "Lotte Finance"),
    ("LG", "Bosch Global Software Technologies Vietnam"), ("NAB", "Bosch Global Software Technologies Vietnam"),
    ("ACBS - Báo Cáo Năm 2026", "ACBS Chạm thông tin"),
    ("SPX", "SPX Express"), ("SPX", "J&T Express"), ("SPX", "giao hàng nhanh GHN"),
    ("ShopeeFood", "Green SM Food"), ("ShopeeFood", "GrabFood"),
    ("Central Retail", "Winmart"), ("HDBank", "HD Securities"),
    ("Ngành Mỹ Phẩm", "M.O.I Cosmetics"), ("Ngành Mỹ Phẩm", "Ofelia Cosmetics"),
    ("Vinamilk", "Vinamilk ICY"), ("Vinamilk", "Vinamilk Pedia Kenji"), ("Vinamilk", "Vinamilk Vfresh"),
    ("Vinamilk", "Vinamilk Yoko Gold"), ("Vinamilk", "sữa Optimum Colos Vinamilk"),
    ("Vinamilk", "sữa dinh dưỡng HappyStar Vinamilk"), ("Vinamilk", "Meta Fresh Nutricare"),
    ("Vinamilk", "Nunest Kid Nutricare"), ("Vinamilk", "S26 Ultima"),
    ("Vinamilk", "Sữa chua uống LIF KUN"), ("Vinamilk", "sữa Coloscare IgG24H Nutricare"),
    ("Vinamilk", "sữa Glucare Gold Nutricare"), ("Vinamilk", "sữa Hanie Kid Nutricare"),
    ("Vinamilk", "sữa Leanpro Thyro Nutricare"), ("Vinamilk", "sữa Metacare Colostrum Nutricare"),
    ("Vinamilk", "sữa đậu nành Fami"), ("Vinamilk", "Phô Mai con bò cười Bel"),
    ("Tocanan - CI Project - Gửi Data Qua API", "Sony 相機"),
    ("Tocanan - CI Project - Gửi Data Qua API", "Xperia 手機"),
    ("Tocanan - CI Project - Gửi Data Qua API", "Canon 相機"),
    ("Tocanan - CI Project - Gửi Data Qua API", "Fujifilm 相機"),
    ("Tocanan - CI Project - Gửi Data Qua API", "Huawei 手機"),
    ("Tocanan - CI Project - Gửi Data Qua API", "Nikon 相機"),
    ("Tocanan - Disney Project 2026", "復仇者聯盟"),
}

DESCRIPTORS = re.compile(
    r"\b(?:viet nam|vietnam|viet nam nha hang|nha hang|tap doan|ngan hang(?: so)?|khu nghi duong|"
    r"ha noi|sai gon|ung dung|benh vien(?: quoc te)?|nuoc rua chen|bot giat|nuoc giat|chung khoan|"
    r"thuong hieu|dien may|noi that|ca phe|cua hang|nha tai tro|tap doan|qua tang|tho trang|my pham|"
    r"sua bot|sua tuoi|sua|nha may|trang trai|nha thuoc|vi dien tu|vi|the|vang|go|"
    r"quoc te|bay|tieng anh|phim|restaurant|hot pot|buffet|technology|corporation|group|limited|company|"
    r"banh|can ho|cosmetics|son|truong|schools?|anh ngu|bao hiem|tra|quan|kem|nuoc khoang|pho mai|"
    r"o to|savico auto|khoang|dau goi|cafe|laptop|fish sauce)\b"
)


def fold(value):
    basic = unicodedata.normalize("NFKD", value.casefold().replace("đ", "d"))
    basic = "".join(c for c in basic if not unicodedata.combining(c))
    return " ".join(re.findall(r"\w+", basic))


def compact(value):
    return fold(value).replace(" ", "")


def evidence_matches(row):
    query = row["keyword"]
    if (row["project_name"], query) in KEEP_WITH_PLAN_EVIDENCE:
        return True
    if row["project_name"] == "Vinmec" and row["level"] == 2:
        return any("Parent_Keyword trống" in v for v in json.loads(row["evidence_json"]))
    evidence = json.loads(row["evidence_json"])
    observations = [fold(part) for e in evidence if re.match(r"^(?:YouTube|Facebook|TikTok|Instagram|Threads|Web):", e, re.I)
                    for part in re.split(r"\s+\|\s+|\n", e.split(":", 1)[1])]
    if not observations:
        return False
    normalized = fold(query)
    anchor = DESCRIPTORS.sub(" ", normalized).split()
    if not anchor:
        return False
    canonical = " ".join(anchor)
    # A title needs to support the specific account, brand or product. Distinctive
    # modifiers stay required, so a parent brand alone cannot justify every variant.
    q = compact(query)
    aq = "".join(anchor)
    variants = {q, aq}
    variants |= {v.replace("numberone", "number1") for v in variants}
    anchors_with_synonyms = {
        "maylanh": "dieuhoa", "daugoi": "shampoo", "saigoneyehospital": "benhvienmatsaigon",
        "enfaenspireoptimum": "enfamilenspireoptimum", "dutchlady": "cogaihalan",
        "grabpaymoca": "vidientumoca", "tiktokshopping": "tiktokshop",
        "vinwonders": "vinwonder", "vangsuamonblanc": "vangsuamontblanc",
    }
    variants |= {variant.replace(a, b) for variant in variants for a, b in anchors_with_synonyms.items() if a in variant}
    for title in observations:
        plain = title.replace(" ", "")
        if any(len(v) >= 5 and v in plain for v in variants):
            return True
        if len(anchor) == 1 and anchor[0] in title.split():
            return True
        if canonical and len(anchor) > 1 and all(token in title.split() for token in anchor):
            return True
    return False


def review(row):
    p, q, level = row["project_name"], row["keyword"], row["level"]
    k = p, q
    if k in OUT_OF_SCOPE:
        status = "REVIEW" if k in {("Panasonic", "máy lọc nước Panasonic"), ("Golden Gate Group", "nhà hàng Mangetsu"), ("Masan", "dầu ăn Tường An")} else "OUT_OF_SCOPE"
        return status, level, None, OUT_OF_SCOPE[k]
    if p == "M-Village":
        return "OUT_OF_SCOPE", level, None, "Tab Keywords/Re - Keywords ghi VinWonders. Đối chiếu tab Keyword List riêng của M Village."
    if q in ES_FILTERS.get(p, set()):
        return "ES_ONLY", level, None, "Nhóm sản phẩm, điều kiện theo dõi hoặc alias của chủ thể đã có. Giữ nguyên bản ghi để đối chiếu plan/ES."
    if k in ALIASES:
        return "ALIAS", level, ALIASES[k], "Dùng một cụm chính cho cùng chủ thể trong project."
    if k in NEEDS_REVIEW:
        return "REVIEW", level, None, NEEDS_REVIEW[k]
    if k in OFFICIAL_CONFIRMED:
        return "READY", level, None, "Đối chiếu tên chủ thể với trang chính thức: " + OFFICIAL_CONFIRMED[k]
    if p == "Vinmec" and q in VINMEC_OUTSIDE_MENTAL_HEALTH:
        return "REVIEW", level, None, "Nằm trong tab Sức khoẻ tinh thần nhưng tên ngành/bệnh rộng hoặc ngoài phạm vi rõ của tab."
    if re.search(r'\+\s*["“]|^[#"]|\b(?:AND|OR|NOT)\b|[<>|=*\[\]{}]', q) or norm_controls(q):
        return "ES_ONLY", level, None, "Dấu hoặc cú pháp chỉ dùng trong truy vấn ES."
    if q in CANONICAL:
        new, _ = CANONICAL[q]
        return "ALIAS", LEVELS.get(k, level), new, "Dùng tên chuẩn, cách viết phổ biến hoặc thực thể rõ hơn; giữ keyword cũ làm alias."
    if k in LEVELS:
        status = "READY" if evidence_matches(row) or k == ("Shopee", "Sao Live Đỉnh Chóp") else "REVIEW"
        return status, LEVELS[k], None, "Sửa Level theo vai trò trong plan. Chỉ giữ trong hàng đợi nếu bằng chứng đủ cụ thể."
    if not evidence_matches(row):
        return "REVIEW", level, None, "Bằng chứng lưu chưa cho thấy đủ tên/chỉ dấu của đúng chủ thể hoặc dòng sản phẩm; cần kiểm tra riêng trước khi search."
    return "READY", level, None, "Giữ sau khi đối chiếu vai trò trong plan và dấu hiệu chủ thể trong bằng chứng lưu."


def norm_controls(value):
    return any(unicodedata.category(ch) in {"Cf", "Cc"} for ch in value)


ADDITIONS = [
    ("M-Village", "M Village", 1, M_VILLAGE_URL, "Keyword List!B8:B10",
     "Tab riêng của dự án ghi Modern Village, M Village; tên M Village còn dùng trong nội dung lịch sử.",
     "https://modernvillagelifestyle.vn/vi/"),
    ("M-Village", "Modern Village Lifestyle", 1, M_VILLAGE_URL, "Keyword List!B8:B10",
     "Tên chính thức hiện tại; lưu cùng M Village vì tên cũ và tên mới khác nhau đáng kể và có thể cho tập bài khác.",
     "https://modernvillagelifestyle.vn/vi/"),
    ("LG", "LG Việt Nam", 1, "https://docs.google.com/spreadsheets/d/1VP1pc-Oc3RpFEn3Ty7pU1u7CnN7S7GwOqwNTrSGxgrU/edit?gid=348074228",
     "A. Corp _ Keywords!E8", "Dùng cách viết thương hiệu chính thức tại Việt Nam thay cho hashtag chuyển đổi.", LG_URL),
    ("C.P Việt Nam (SmartCom)", "C.P. Việt Nam", 1, "https://docs.google.com/spreadsheets/d/1E3jmMPijAlKizS-ntXMl8o1aevSOEH7V",
     "Keywords!K5", "Tên chủ thể chính theo site thương hiệu.", CP_URL),
    ("ShopeeFood", "beFood", 2, "https://docs.google.com/spreadsheets/d/1GmVVqLUxWDGCKaViURgbxRpJVn2w-IV_wlpbZxAT4Q8",
     "Tracking Keyword (2026)!A8:B8", "Tên dịch vụ giao đồ ăn được chỉ định ở cột Brand.", "https://food.be.com.vn/"),
]

BANK_NAMES = {
    "VietinBank": ("https://investor.vietinbank.vn/vi/w/thong-bao-thay-doi-giay-phep-thanh-lap-va-hoat-dong-cua-vietinbank-5", {"BIDV", "HDBank", "SHB Bank"}),
    "VPBank": ("https://www.vpbank.com.vn/", {"BIDV", "HDBank", "SHB Bank", "Cake"}),
}

def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def plan_review(db):
    rows = db.execute("""SELECT * FROM keywords
                         WHERE status='READY' AND lower(project_status)!='stop'
                         ORDER BY project_name,level,keyword""").fetchall()
    decisions = []
    for row in rows:
        status, level, replacement, reason = review(row)
        if status == "READY" and level == row["level"] and replacement is None:
            continue
        decisions.append({"project": row["project_name"], "keyword": row["keyword"], "before_status": row["status"],
                          "before_level": row["level"], "status": status, "level": level,
                          "replacement": replacement, "reason": reason})
    return rows, decisions


def apply(db, rows, decisions):
    original = {(r["project_name"],r["keyword"]): r for r in rows}
    added = []
    with db:
        db.execute("""CREATE TABLE IF NOT EXISTS keyword_quality_audit (
            audit_id TEXT NOT NULL, project_name TEXT NOT NULL, keyword TEXT NOT NULL,
            previous_status TEXT, current_status TEXT NOT NULL, previous_level INTEGER, current_level INTEGER NOT NULL,
            replacement TEXT, reason TEXT NOT NULL,
            PRIMARY KEY(audit_id,project_name,keyword))""")
        if db.execute("SELECT 1 FROM keyword_quality_audit WHERE audit_id=? LIMIT 1", (AUDIT,)).fetchone():
            raise RuntimeError("Review already applied.")
        for d in decisions:
            key = (d["project"], d["keyword"])
            row = original[key]
            reasons = json.loads(row["reasons_json"]) + [d["reason"]]
            db.execute("UPDATE keywords SET status=?,level=?,reasons_json=? WHERE project_name=? AND keyword=?",
                       (d["status"], d["level"], encode(reasons), *key))
            db.execute("INSERT INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)",
                       (AUDIT, *key, d["before_status"], d["status"], d["before_level"], d["level"], d["replacement"], d["reason"]))
            replacement = d["replacement"]
            if not replacement:
                continue
            if d["keyword"] not in CANONICAL:
                continue
            _, authority = CANONICAL[d["keyword"]]
            new_evidence = json.loads(row["evidence_json"]) + ([authority] if authority else [])
            target = {**dict(row), "keyword": replacement, "evidence_json":encode(new_evidence)}
            scoped = "READY" if authority or evidence_matches(target) else "REVIEW"
            same_keyword = db.execute("SELECT keyword,status FROM keywords WHERE project_name=? AND keyword=?",
                                     (d["project"], replacement)).fetchone()
            if same_keyword:
                continue
            db.execute("INSERT INTO keywords VALUES (?,?,?,?,?,?,?,?,?)",
                       (replacement,d["project"],d["level"],scoped,row["project_status"],row["subjects_json"],
                        encode(new_evidence),row["originals_json"],encode(reasons)))
            db.execute("INSERT INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)",
                       (AUDIT,d["project"],replacement,None,scoped,None,d["level"],None,d["reason"]))
            added.append((d["project"], replacement, scoped))
        for project, query, level, url, loc, reason, authority in ADDITIONS:
            p = db.execute("SELECT plan_status FROM projects WHERE project_name=?", (project,)).fetchone()
            prior = db.execute("SELECT status,level FROM keywords WHERE project_name=? AND keyword=?", (project,query)).fetchone()
            provenance = [{"plan_url":url, "cell":loc, "method":"manual keyword review", "keyword":query}]
            if prior:
                db.execute("""UPDATE keywords SET status='READY',level=?,project_status=?,subjects_json=?,
                    evidence_json=?,originals_json=?,reasons_json=? WHERE project_name=? AND keyword=?""",
                           (level,p[0],encode([query]),encode([authority]),encode(provenance),encode([reason]),project,query))
            else:
                db.execute("INSERT INTO keywords VALUES (?,?,?,?,?,?,?,?,?)",
                           (query,project,level,"READY",p[0],encode([query]),encode([authority]),encode(provenance),encode([reason])))
                added.append((project,query,"READY"))
            db.execute("INSERT INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)",
                       (AUDIT,project,query,prior[0] if prior else None,"READY",prior[1] if prior else None,level,None,reason))
        for (project, query), authority in OFFICIAL_CONFIRMED.items():
            row = original.get((project, query))
            if row:
                evidence = [*json.loads(row["evidence_json"]), authority]
                db.execute("UPDATE keywords SET evidence_json=? WHERE project_name=? AND keyword=?",
                           (encode(list(dict.fromkeys(evidence))),project,query))
        for query, (authority, projects) in BANK_NAMES.items():
            for project in sorted(projects):
                row = db.execute("SELECT * FROM keywords WHERE keyword=? AND project_name=? AND status='REVIEW'",
                                 (query,project)).fetchone()
                if not row:
                    continue
                notes = json.loads(row["originals_json"])
                if not any(str(item.get("query","")).casefold()==("#"+query).casefold() for item in notes):
                    continue
                reason = "Tên ngân hàng độc lập sau khi bỏ dấu hashtag; đối chiếu tên chính thức và giữ vai trò đối thủ theo plan."
                db.execute("""UPDATE keywords SET status='READY',level=2,evidence_json=?,reasons_json=?
                              WHERE project_name=? AND keyword=?""",
                           (encode([authority]),encode([*json.loads(row["reasons_json"]),reason]),project,query))
                db.execute("INSERT INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)",
                           (AUDIT,project,query,row["status"],"READY",row["level"],2,None,reason))
                added.append((project,query,"READY"))
        db.execute("""CREATE VIEW IF NOT EXISTS search_terms AS
            SELECT min(Keyword) AS Keyword, json_group_array(json_object('ProjectName',ProjectName,'Level',Level)) AS Projects
            FROM search_queue GROUP BY Keyword COLLATE NOCASE""")
        remaining = db.execute("SELECT count(*) n FROM search_queue").fetchone()["n"]
        assert [r["Keyword"] for r in db.execute("SELECT Keyword FROM search_queue WHERE ProjectName=? AND Level=1",
                                                ("Bệnh Viện Quốc Tế Mỹ",))] == ["AIH"]
        assert not db.execute("SELECT 1 FROM search_queue WHERE ProjectName='M-Village' AND instr(lower(Keyword),'vinwonders')>0").fetchall()
        assert not db.execute("SELECT 1 FROM search_queue WHERE ProjectName='Saint-gobain' AND Keyword='Mikado sushi'").fetchall()
        assert not db.execute("PRAGMA foreign_key_check").fetchall()
        totals = collections.Counter(d["status"] for d in decisions)
        result = {"checked_at":datetime.now(timezone.utc).isoformat(), "before":len(rows), "after":remaining,
                  "decisions":dict(totals), "added":added,
                  "distinct_search_terms":db.execute("SELECT count(*) FROM search_terms").fetchone()[0],
                  "status_scope":"READY records passed plan/evidence review. Historical examples do not certify every platform.",
                  "project_rows_not_changed":len(original)-len(decisions)}
        db.execute("INSERT OR REPLACE INTO catalog_metadata VALUES (?,?)", ("keyword_quality_review",encode(result)))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    mode = "rw" if args.apply else "ro"
    db = sqlite3.connect(DB.resolve().as_uri() + "?mode=" + mode, uri=True)
    db.row_factory = sqlite3.Row
    try:
        rows, decisions = plan_review(db)
        preview = {"rows_reviewed":len(rows),"decisions_by_status":dict(collections.Counter(d["status"] for d in decisions)),
                   "decisions":decisions}
        path = ROOT / "keyword-quality-review.json"
        if args.apply:
            preview["applied"] = apply(db, rows, decisions)
            assert db.execute("PRAGMA quick_check").fetchone()[0] == "ok"
            print(encode(preview["applied"]))
        else:
            print(encode({k:v for k,v in preview.items() if k!="decisions"}))
        path.write_text(json.dumps(preview, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    finally:
        db.close()


if __name__ == "__main__":
    main()
