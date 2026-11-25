"""Apply evidence-backed keyword decisions and expose platform-specific search queues."""
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sqlite3
from urllib.parse import urlencode

from audit_catalog_search_keywords import DB, ROOT, encode, fold
from collect_catalog_platform_audit import OUT, write_json
from deduplicate_catalog_keywords import reconcile as reconcile_spelling

AUDIT = "2026-11-19-cross-platform"
PLATFORMS = ("facebook", "youtube", "news")
SOCIAL_CHANNELS = ("facebook", "tiktok", "threads", "instagram")
LEGACY = Path("outputs/project-refresh-2026-11-10/completion/search-evidence-final.json")
NATIVE_NEWS = {
    "AIH", "bệnh viện AIH", "BV AIH", "Bệnh viện Quốc tế Mỹ", "American International Hospital",
    "Ngân hàng số Cake", "Cake by VPBank", "Cake nhận tiền quốc tế", "trầm cảm sau sinh", "trầm cảm",
    "căng thẳng tâm lý", "stress", "thị trường sữa công thức", "sữa công thức", "thị trường thanh toán số",
    "ngành dịch vụ thanh toán", "DragonX", "Chứng chỉ quỹ VinaCapital", "VinFast", "SPX Express", "Shopee Express",
    "App DragonX", "căn hộ 12View", "12View", "Dragon Capital", "VinaCapital",
}

# project, keyword, level, subject, catalog status, plan evidence, platform findings, optional replaced keyword
DECISIONS = [
    ("Bệnh Viện Quốc Tế Mỹ", "AIH", 1, "Bệnh Viện Quốc Tế Mỹ (AIH)", "CHANNEL_ONLY", "Keyword!B2", {
        "facebook": ("ALIAS", "bệnh viện AIH", "Cụm ngắn có bài đúng bệnh viện và nhiều mẫu về AI không liên quan."),
        "youtube": ("ALIAS", "bệnh viện AIH", "Mẫu đầu trả nhạc AI và video ngoài phạm vi bệnh viện."),
        "news": ("READY", None, "Giữ từ khóa chính. Mẫu gồm báo Dân trí, Thanh Niên, Tuổi Trẻ và VnExpress về đúng AIH.")}, None),
    ("Bệnh Viện Quốc Tế Mỹ", "bệnh viện AIH", 1, "Bệnh Viện Quốc Tế Mỹ (AIH)", "READY", "Keyword!B2", {
        "facebook": ("READY", None, "Có bài Page AIH, báo Dân trí và thảo luận về đúng bệnh viện."),
        "youtube": ("READY", None, "Video trên kênh chính thức của American International Hospital xác nhận chủ thể."),
        "news": ("ALIAS", "AIH", "Trùng 9 bài trong 10 kết quả đầu với AIH, tính theo URL bài duy nhất.")}, None),
    ("Cake", "ngân hàng số Cake", 1, "Cake", "READY", "KW 2026!D4", {
        "facebook": ("READY", None, "Page chính thức và cộng đồng Cake by VPBank đều xuất hiện trong mẫu."),
        "youtube": ("READY", None, "Kênh chính thức Cake by VPBank có nhiều video đúng chủ thể."),
        "news": ("READY", None, "Có nhiều bài về ngân hàng số Cake. So với Cake by VPBank chỉ trùng 2/10 URL trong mẫu.")}, None),
    ("Cake", "Cake by VPBank", 1, "Cake", "READY", "KW 2026!D5", {
        "facebook": ("READY", None, "Mẫu bài có đúng tên Cake by VPBank và thảo luận về ứng dụng."),
        "youtube": ("READY", None, "Nhiều video từ kênh Cake by VPBank."),
        "news": ("READY", None, "Lấy thêm bài đúng ngân hàng. Trùng 2/10 URL với cụm ngân hàng số Cake trong mẫu.")}, None),
    ("Cake", "Cake nhận tiền quốc tế", 1, "Cake GlobalX", "READY", "KW 2026!D124", {
        "facebook": ("READY", None, "Có bài về Cake GlobalX và tính năng nhận tiền từ Page Cake by VPBank."),
        "youtube": ("REVIEW", None, "Lần tìm trực tiếp chưa trả mẫu video đủ để xác nhận dịch vụ."),
        "news": ("READY", None, "Có bài ra mắt dịch vụ, triển khai tại Việt Nam và hợp tác Điện Máy Xanh. Trùng 3/10 URL với keyword thương hiệu.")}, None),
    ("Vinmec", "trầm cảm sau sinh", 2, "trầm cảm sau sinh", "READY", "Thai Sản!C42; Sức khoẻ tinh thần!C21", {
        "facebook": ("READY", None, "Các mẫu trực tiếp cùng nhắc đến trầm cảm sau sinh."),
        "youtube": ("READY", None, "Kênh Vinmec, Báo Sức khỏe & Đời sống và AloBacsi có video về đúng chủ đề."),
        "news": ("READY", None, "Có bài riêng về trầm cảm sau sinh. Trùng 2/10 URL với chủ đề trầm cảm chung.")}, None),
    ("Vinmec", "căng thẳng tâm lý", 2, "stress", "READY", "Sức khoẻ tinh thần!C10", {
        "facebook": ("READY", None, "Mẫu cho thảo luận trong nhóm tâm lý và tư vấn căng thẳng."),
        "youtube": ("READY", None, "Mẫu có chuyên khoa Tâm lý Tâm thần và video về stress, lo âu."),
        "news": ("READY", None, "Mẫu có bài can thiệp tâm lý và stress do công việc. Trùng 0/10 URL với stress, vốn trả cả tin stress ở vật nuôi.")}, "stress"),
    ("Enfa", "thị trường sữa công thức", 2, "Ngành sữa công thức", "CHANNEL_ONLY", "Industry Keywords!C6", {
        "facebook": ("REVIEW", None, "Mẫu còn thiên về hỏi chọn sữa và trải nghiệm mua."),
        "youtube": ("REVIEW", None, "Lẫn review sữa, đầu tư vào công ty và nội dung giới thiệu sản phẩm."),
        "news": ("READY", None, "Mẫu mới có báo cáo thị trường, top thương hiệu và tin ngành. Trùng 1/10 URL với sữa công thức.")}, None),
    ("NAPAS MS", "thị trường thanh toán số", 2, "Tin ngành", "CHANNEL_ONLY", "Roster dòng 286 và 607", {
        "facebook": ("REVIEW", None, "Facebook trả lẫn nhiều bài tuyển dụng và kết quả không gắn thị trường thanh toán."),
        "youtube": ("REVIEW", None, "Có clip thanh toán số, lẫn thị trường tiền tệ và tỷ giá."),
        "news": ("READY", None, "Mẫu gồm thanh toán không tiền mặt, QR xuyên biên giới và hoạt động thị trường có NAPAS. Trùng 0/10 URL với ngành dịch vụ thanh toán.")}, None),
    ("Tasco", "Vinfast", 1, "VinFast_", "CHANNEL_ONLY", "Updated_Từ khóa!G24", {
        "facebook": ("OUT_OF_SCOPE", None, "Plan ghi online news. Facebook trả đúng hãng trong mẫu."),
        "youtube": ("OUT_OF_SCOPE", None, "Plan ghi online news."),
        "news": ("READY", None, "Nhiều bài về VinFast VF 5, VF 6 và mẫu xe của hãng. Đúng phạm vi online news.")}, None),
    ("VinaCapital", "Chứng chỉ quỹ VinaCapital", 1, "VinaCapital", "READY", "Keywords for BHC!D39", {
        "facebook": ("READY", None, "Mẫu trong cộng đồng đầu tư thảo luận các chứng chỉ quỹ VinaCapital như VFF."),
        "youtube": ("REVIEW", None, "Lần tìm trực tiếp chưa có mẫu video."),
        "news": ("READY", None, "Các bài về đối tác phân phối chứng chỉ quỹ VinaCapital xác nhận đúng nhóm sản phẩm.")}, None),
    ("VinaCapital", "DragonX", 2, "Dragon Capital", "READY", "Keywords for BHC!D71,D86", {
        "facebook": ("READY", None, "Có bài từ chính Dragon Capital Việt Nam về ứng dụng."),
        "youtube": ("READY", None, "Có video chính thức của Dragon Capital và video giới thiệu app. Có thể lẫn từ đồng âm ở các video dưới."),
        "news": ("REVIEW", None, "Lẫn đội tuyển thể thao điện tử KINGZONE DRAGONX. App DragonX còn lẫn bài tổng hợp ứng dụng, cần thêm mẫu đúng app.")}, None),
    ("Hưng Thịnh Corp", "12View", 1, "Hưng Thịnh Land", "CHANNEL_ONLY", "Từ khóa!C28,C29", {
        "facebook": ("REVIEW", None, "Chưa có mẫu hiển thị đủ để xác nhận dự án."),
        "youtube": ("READY", None, "Có video giới thiệu và video chung cư 12View."),
        "news": ("READY", None, "Tin về cấp sổ hồng và chung cư Tín Phong – 12 View khớp dự án.")}, None),
    ("SPX", "SPX Express", 1, "SPX Express", "READY", "Roster SPX và Keywords 2023!A3", {
        "facebook": ("READY", None, "Có Page SPX Express và bài về hoạt động giao hàng."),
        "youtube": ("READY", None, "Có video về dịch vụ giao nhận SPX Express."),
        "news": ("READY", None, "Kết quả tập trung vào chính sách giao nhận của SPX. Trùng 0/10 URL với tên cũ Shopee Express.")}, None),
    ("SPX", "Shopee Express", 1, "SPX Express", "READY", "Keywords 2023!A3", {
        "facebook": ("READY", None, "Mẫu bài nhắc đúng đơn vị vận chuyển Shopee Express và hoạt động giao hàng."),
        "youtube": ("READY", None, "Video giao nhận và trung tâm phân loại mang tên Shopee Express."),
        "news": ("READY", None, "Có bài về SPX logistics từ tên cũ và chưa trùng URL với SPX Express trong mẫu 10 bài.")}, None),
]

NEWS_ALIASES = [("Bệnh Viện Quốc Tế Mỹ", "bệnh viện AIH", "AIH", 9, 10),
                ("Bệnh Viện Quốc Tế Mỹ", "BV AIH", "AIH", 6, 10),
                ("Bệnh Viện Quốc Tế Mỹ", "Bệnh viện Quốc tế Mỹ", "AIH", 6, 10)]

FACEBOOK_TAGS = {keyword.casefold(): name for keyword,name in {
    "#HDBank": "HDBank", "#VikkiDigitalBank": "Ngân hàng Số Vikki", "#FPTShop": "FPT Shop và các chi nhánh",
    "#CellphoneS": "CellphoneS", "#TopZone": "TopZone", "#DienMayXanh": "Điện máy XANH",
    "#NganhangsoCake": "Ngân hàng số Cake by VPBank", "#CakebyVPBank": "Ngân hàng số Cake by VPBank",
    "#BVHoanMySaiGon": "BV Hoàn Mỹ Sài Gòn",
}.items()}

FACEBOOK_SPECIALTY = {
    "vẹo cột sống": "Nhiều bài khớp cụm tìm riêng, có Bệnh viện Quân y 175 và nhóm trao đổi cong vẹo cột sống.",
    "rung nhĩ": "Bốn mẫu hiển thị khớp cụm rung nhĩ, gồm bài từ cộng đồng y khoa và bác sĩ.",
}

REVIEW_NOTES = {
    ("Enfa", "sữa công thức"): "Google News có bài quy định quảng cáo, dị ứng và thu hồi sản phẩm. Dùng ‘thị trường sữa công thức’ cho phạm vi tin ngành. Hai cụm chỉ trùng 1/10 URL trong lượt so trực tiếp.",
    ("LG", "Bosch Global Software Technologies Vietnam"): "Tên trả đúng đơn vị phần mềm Bosch tại Việt Nam trên Facebook và Google News, gồm bài tuyển dụng và R&D. Roster đối thủ LG chưa xác định mảng này trong phạm vi thiết bị.",
    ("Miss Cosmo 2026", "Miss Cosmo Cosmo Camp"): "Facebook, kênh UNI NETWORK trên YouTube và Google News đều dẫn về Cosmo Camp của cuộc thi Hoa hậu Hoàn vũ Việt Nam năm 2025. Scope quốc tế 2026 vẫn chưa có mẫu đúng mùa.",
    ("NAPAS MS", "ngành dịch vụ thanh toán"): "Google News lẫn số hóa hành chính và tin ngân hàng chung. Dùng ‘thị trường thanh toán số’ cho tin ngành. Hai cụm không trùng URL trong 10 bài đầu mỗi bên.",
    ("ShopeePay", "ví TikTok"): "Google News lẫn tin rộng về TikTok. YouTube và Facebook tìm ‘TikTok Pay’ còn lẫn PayLater. Hai sản phẩm nằm ở hai dòng riêng trong plan ShopeePay.",
    ("Vinamilk", "sữa A2 Platinum Premium"): "Google News trả nhiều bài thu hồi sản phẩm cùng tên của The a2 Milk Company. Roster Vinamilk xếp dòng SBTE_A2 Platinum Premium Level 1 nên còn cần xác nhận vai trò trước khi đưa vào queue.",
    ("Vinmec", "non stress test là gì"): "Google News và mẫu video vẫn dẫn về theo dõi tim thai hoặc khớp nhầm từ test. Ô gốc thuộc Sức khoẻ tinh thần.",
    ("Vinmec", "rối loạn chuyển hóa"): "Google News chủ yếu ra chuyển hóa, tiểu đường và nội tiết. Tab Sức khoẻ tinh thần chưa có phạm vi cụ thể cho phần này.",
    ("Vinmec", "rối loạn cương dương"): "Google News chủ yếu ra nam khoa và điều trị thể chất. Cụm chưa khoanh được phần tâm lý thuộc tab gốc.",
    ("Vinmec", "rối loạn kinh nguyệt"): "Google News thiên về phụ khoa, mãn kinh và chu kỳ kinh. Chỉ một phần kết quả đề cập lo âu.",
    ("Vinmec", "rối loạn nội tiết tố"): "Google News chủ yếu nói hormone và tiền mãn kinh. Tab gốc là Sức khoẻ tinh thần.",
    ("Vinmec", "rối loạn sắc giác"): "Google News và mẫu video ra mù màu, võng mạc và kiểm tra nhận biết màu. Đây là chủ đề nhãn khoa, còn ô gốc ở Sức khoẻ tinh thần.",
    ("Vinmec", "rối loạn thái dương hàm"): "Google News chủ yếu ra bệnh khớp hàm và nha khoa. Cụm đứng riêng chưa khoanh được phần liên quan stress theo tab gốc.",
    ("Vinmec", "rối loạn thần kinh"): "Facebook nổi bật thảo luận thần kinh thực vật, đã có cụm riêng trong kho. Google News trộn phát triển thần kinh, loạn thần và các biểu hiện khác.",
    ("Vinmec", "rối loạn tiêu hóa"): "Google News chủ yếu ra viêm tụy, rối loạn tiêu hóa và chẩn đoán đường ruột. Dòng đang thuộc tab Sức khoẻ tinh thần.",
    ("Vinmec", "rối loạn tiền đình"): "Google News chủ yếu ra chóng mặt, bệnh tiền đình và chẩn đoán thần kinh. Chưa có mẫu xác định góc tâm lý cho dòng trong tab gốc.",
    ("Vinmec", "rối loạn xuất tinh"): "Google News và video thiên về nam khoa. Có bài đề cập trầm cảm nhưng phần còn lại rộng hơn scope Sức khoẻ tinh thần.",
    ("Vinmec", "rối loạn đông máu"): "Google News trả tin huyết học, thai kỳ và các ca phẫu thuật. Ô gốc thuộc Sức khoẻ tinh thần.",
    ("Vinmec", "stressam"): "Google News tách thành stress, ám ảnh hoặc stress âm thầm. Các lần trước còn trùng tên thuốc Stresam. Chưa xác định được cụm trong plan chỉ chủ thể nào.",
    ("Vinmec", "điều gì làm bạn cảm thấy lo âu trong cuộc sống"): "Google News trả bài về lo âu bệnh tật, mạng xã hội và sức khỏe tinh thần nói chung. Câu hỏi dài chưa tạo tập bài riêng ổn định. Kho có ‘rối loạn lo âu’ cho chủ đề đã xác minh.",
}


def pending_note(project, keyword):
    if project == "Saint-gobain":
        return "Plan giới hạn TikTok từ 01/08 đến 31/10/2026. Cụm đứng riêng có kết quả đúng chủ đề nhưng cần giữ phạm vi kênh và ngày đăng của đợt đó."
    return REVIEW_NOTES.get((project, keyword))


def query_url(platform, q):
    if platform == "facebook":
        return "https://www.facebook.com/search/posts/?" + urlencode({"q": q})
    if platform == "youtube":
        return "https://www.youtube.com/results?" + urlencode({"search_query": q, "hl": "vi", "gl": "VN"})
    return "https://news.google.com/search?" + urlencode({"q": q, "hl": "vi", "gl": "VN", "ceid": "VN:vi"})


def observations(platform):
    found = {}
    for name in (f"{platform}-search.jsonl", f"{platform}-search-followup.jsonl"):
        path = OUT / name
        if not path.is_file():
            continue
        data = path.read_text(encoding="utf-8")
        if not data.endswith("\n"):
            data = data.rpartition("\n")[0]
        for line in data.splitlines():
            rec = json.loads(line)
            key = rec["keyword"].casefold()
            if key not in found or rec["status"] == "OK" or found[key]["status"] != "OK":
                found[key] = rec
    return found


def phrase(value):
    return re.sub(r"[^\w]+", " ", fold(value or "")).strip()


def exact(text, word):
    return f" {phrase(word)} " in f" {phrase(text)} "


def vinmec_specialty_decisions():
    path = OUT / "vinmec-specialty-candidates.json"
    if not path.is_file():
        return []
    chosen = []
    yt, news = observations("youtube"), observations("news")
    for row in json.loads(path.read_text(encoding="utf-8")):
        keyword = row["value"]
        lookup = keyword.casefold()
        findings = {"facebook": ("NOT_CHECKED", None, "Chưa có mẫu Facebook cho cụm này trong lượt rà hiện tại.")}
        if keyword in FACEBOOK_SPECIALTY:
            findings["facebook"] = ("READY",None,FACEBOOK_SPECIALTY[keyword])
        for platform, collected in (("youtube", yt), ("news", news)):
            sample = collected.get(lookup, {}).get("results", [])[:10]
            hits = [r for r in sample if exact(r.get("title"), keyword)]
            owners = {r.get("channel" if platform == "youtube" else "publisher") for r in hits} - {None, ""}
            minimum = 4 if platform == "youtube" else 5
            if len(hits) >= minimum and len(hits)*2 >= len(sample) and len(owners) >= 3:
                findings[platform] = ("READY",None,f"Cụm chính tại tab {row['sheet']} khớp {len(hits)}/{len(sample)} tiêu đề từ {len(owners)} nguồn khác nhau.")
            else:
                findings[platform] = ("REVIEW" if sample else "NOT_CHECKED",None,
                                      "Chưa có đủ mẫu khớp chủ đề chuyên khoa cho truy vấn này.")
        if any(f[0] == "READY" for f in findings.values()):
            status = "READY" if findings["facebook"][0] == "READY" else "CHANNEL_ONLY"
            chosen.append(("Vinmec",keyword,2,keyword,status,f"{row['sheet']}!{row['cell']}",findings,None))
    return chosen


def classify(row, platform, observed, historical):
    keyword, subjects, status, level = row
    if platform == "news" and keyword.startswith("#"):
        return "OUT_OF_SCOPE", None, "Hashtag dùng riêng cho tìm nội dung trên nền tảng xã hội."
    if status == "REVIEW":
        return "REVIEW", None, "Phạm vi hoặc chủ thể cần đối chiếu lại theo lý do của dòng trong kho."
    if not observed:
        if historical:
            return "READY", None, "Có mẫu đúng chủ thể trong lượt xác minh đã lưu cùng plan."
        return "NOT_CHECKED", None, "Chưa có mẫu tìm kiếm của kênh này."
    if observed["status"] != "OK":
        return "REVIEW", None, f"Trạng thái mẫu tìm kiếm {observed['status']}."
    anchor_length = len(phrase(keyword).replace(" ", ""))
    if historical and platform == "youtube" and anchor_length > 4:
        return "READY", None, "Có bằng chứng YouTube đã được chọn trước đó và có mẫu công khai trong lượt này."
    subject_words = [phrase(v) for v in json.loads(subjects) if isinstance(v, str) and phrase(v)]
    word = phrase(keyword)
    anchored = len(word.split()) >= 2 and any(exact(word, subject) or exact(subject, word) for subject in subject_words)
    if anchored and not keyword.startswith("#"):
        samples = observed.get("results", [])[:10]
        hits = [s for s in samples if exact(s.get("title"), keyword)]
        if platform == "news":
            publishers = {r["publisher"] for r in hits if r.get("publisher")}
            if len(hits) >= 5 and len(hits) * 10 >= len(samples) * 6 and len(publishers) >= 3:
                return "READY", None, f"Đã khớp cụm đầy đủ và chủ thể plan trong {len(hits)}/{len(samples)} tiêu đề từ {len(publishers)} nguồn."
        elif len(hits) >= 4 and len(hits) * 2 >= len(samples):
            return "READY", None, f"Đã khớp cụm đầy đủ và chủ thể plan trong {len(hits)}/{len(samples)} tiêu đề video."
    return "REVIEW", None, "Có mẫu tìm kiếm. Cần đối chiếu ngữ cảnh của từng bài với scope plan trước khi đưa vào hàng đợi."


def apply_keywords(db):
    touched = []
    for project, keyword, level, subject, status, scope, findings, replaced in DECISIONS:
        plan_status, plan_url = db.execute("SELECT plan_status,plan_url FROM projects WHERE project_name=?", (project,)).fetchone()
        assert plan_status == "running", project
        current = db.execute("SELECT keyword,level,status,evidence_json,originals_json,reasons_json FROM keywords "
                             "WHERE project_name=? AND keyword=? COLLATE NOCASE", (project, keyword)).fetchone()
        if current:
            keyword, old_level, old_status, evidence, history, reasons = current
            assert old_level == level, (project, keyword, old_level, level)
            evidence, history, reasons = map(json.loads, (evidence, history, reasons))
        else:
            old_status = old_level = None
            evidence, history, reasons = [], [], []
        if db.execute("SELECT 1 FROM keyword_quality_audit WHERE audit_id=? AND project_name=? AND keyword=?",
                      (AUDIT,project,keyword)).fetchone():
            continue
        note = {"method": AUDIT, "plan_reference": scope, "plan_url": plan_url,
                "reason_by_platform": findings, "replaces": replaced}
        evidence.extend(query_url(p, keyword) for p in findings)
        history.append(note)
        reason = " ".join(f"{p}: {r}" for p, (_, _, r) in findings.items())
        reasons.append(reason)
        db.execute("""INSERT INTO keywords (keyword,project_name,level,status,project_status,subjects_json,evidence_json,originals_json,reasons_json)
                      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(project_name,keyword) DO UPDATE SET
                      status=excluded.status,evidence_json=excluded.evidence_json,originals_json=excluded.originals_json,
                      reasons_json=excluded.reasons_json""",
                   (keyword,project,level,status,plan_status,encode([subject]),encode(evidence),encode(history),encode(reasons)))
        db.execute("INSERT INTO keyword_quality_audit VALUES(?,?,?,?,?,?,?,?,?)",
                   (AUDIT,project,keyword,old_status,status,old_level,level,None,reason))
        if replaced:
            before = db.execute("SELECT level,status,reasons_json FROM keywords WHERE project_name=? AND keyword=?",
                                (project,replaced)).fetchone()
            assert before[:2] == (level,"REVIEW")
            alias_reason = f"Đã tìm riêng và xác nhận cụm {keyword} có phạm vi rõ hơn cho plan."
            db.execute("UPDATE keywords SET status='ALIAS',reasons_json=? WHERE project_name=? AND keyword=?",
                       (encode([*json.loads(before[2]),alias_reason]),project,replaced))
            db.execute("INSERT INTO keyword_quality_audit VALUES(?,?,?,?,?,?,?,?,?)",
                       (AUDIT,project,replaced,"REVIEW","ALIAS",level,level,keyword,alias_reason))
        touched.append((project,keyword,status))
    for project, keyword, level, old_reasons in db.execute("SELECT project_name,keyword,level,reasons_json FROM keywords WHERE status='REVIEW'").fetchall():
        note = pending_note(project, keyword)
        if note and note not in json.loads(old_reasons):
            db.execute("UPDATE keywords SET reasons_json=? WHERE project_name=? AND keyword=?",
                       (encode([*json.loads(old_reasons),note]),project,keyword))
            db.execute("INSERT OR IGNORE INTO keyword_quality_audit VALUES(?,?,?,'REVIEW','REVIEW',?,?,NULL,?)",
                       (AUDIT,project,keyword,level,level,note))
    return touched


def make_views(db):
    db.execute("""CREATE TABLE IF NOT EXISTS keyword_platform_audit (
        project_name TEXT NOT NULL, keyword TEXT NOT NULL, platform TEXT NOT NULL, status TEXT NOT NULL,
        canonical_keyword TEXT, reason TEXT NOT NULL, search_url TEXT NOT NULL, sample_status TEXT NOT NULL,
        checked_at TEXT, samples_json TEXT NOT NULL, PRIMARY KEY(project_name,keyword,platform),
        FOREIGN KEY(project_name,keyword) REFERENCES keywords(project_name,keyword))""")
    db.execute("""CREATE TABLE IF NOT EXISTS news_keyword_aliases (
        project_name TEXT NOT NULL, alias TEXT NOT NULL, primary_keyword TEXT NOT NULL,
        shared_articles INTEGER NOT NULL, sample_size INTEGER NOT NULL, checked_at TEXT NOT NULL,
        PRIMARY KEY(project_name,alias), FOREIGN KEY(project_name,primary_keyword) REFERENCES keywords(project_name,keyword))""")
    for platform in PLATFORMS:
        db.execute(f"""CREATE VIEW IF NOT EXISTS {platform}_search_queue AS
              SELECT a.project_name AS ProjectName,a.keyword AS Keyword,k.level AS Level,a.status AS Status,
                     a.search_url AS SearchUrl,a.reason AS Reason,a.sample_status AS EvidenceStatus
              FROM keyword_platform_audit a JOIN keywords k USING(project_name,keyword)
              WHERE a.platform='{platform}' AND a.status='READY' AND lower(k.project_status)='running'""")
    db.execute(f"""CREATE VIEW IF NOT EXISTS social_search_queue AS
         SELECT *, '{encode(SOCIAL_CHANNELS)}' AS Platforms FROM facebook_search_queue""")
    db.execute("""CREATE VIEW IF NOT EXISTS social_source_catalog AS
        SELECT Channel, Type, Name, Link,
           CASE WHEN id_status IN ('ARCHIVE_VERIFIED','PLATFORM_VERIFIED') AND Type!='unknown' THEN Id END AS VerifiedId,
           CASE WHEN id_status NOT IN ('ARCHIVE_VERIFIED','PLATFORM_VERIFIED') THEN Id END AS CandidateId,
           Follower, ProjectName, id_status, group_privacy, group_privacy_status, follower_kind, follower_precision,
           follower_as_of, follower_source, source_status, source_key, identity_evidence_json, original_links_json
        FROM source_catalog WHERE Channel IN ('facebook','threads','youtube','tiktok','instagram','linkedin')""")
    db.execute("""CREATE VIEW IF NOT EXISTS social_sources_needing_review AS SELECT * FROM social_source_catalog
        WHERE VerifiedId IS NULL OR nullif(trim(Name),'') IS NULL OR Type='group_unknown'""")


def add_channel_audit(db, now):
    collected = {p: observations(p) for p in ("youtube", "news")}
    legacy = {(r["platform"].casefold(), r["query"].casefold()): r for r in json.loads(LEGACY.read_text(encoding="utf-8"))
              if r.get("outcome") == "ACCEPTED"}
    social = ROOT / "keyword-review-followup/social-review-evidence.json"
    for row in json.loads(social.read_text(encoding="utf-8"))["rows"]:
        if row["id"] in {5,11,17,34,35,48,78,85,103}:
            query = row["replacement"] or row["keyword"]
            legacy["facebook", query.casefold()] = {"evidence": row["reason"], "url": row["platforms"]["Facebook"]["search_url"]}
    manual = {(project, q.casefold()): results for project,q,_,_,_,_,results,_ in DECISIONS}
    for project, q, level, status, subjects in db.execute("""SELECT project_name,keyword,level,status,subjects_json
        FROM keywords WHERE status IN ('READY','REVIEW','CHANNEL_ONLY') AND lower(project_status)='running'""").fetchall():
        for platform in PLATFORMS:
            observation = collected.get(platform, {}).get(q.casefold())
            historical = legacy.get((platform, q.casefold()))
            selected = manual.get((project, q.casefold()), {}).get(platform)
            if platform == "facebook" and status == "READY" and q.casefold() in FACEBOOK_TAGS:
                found = FACEBOOK_TAGS[q.casefold()]
                selected = ("READY",None,f"Tìm riêng hashtag trên Facebook Posts trả nhiều mẫu về {found}, khớp chủ thể plan.")
            outcome, canonical, reason = selected or classify((q,subjects,status,level),platform,observation,historical)
            if not selected and status == 'REVIEW' and (note := pending_note(project,q)):
                outcome, reason = ('OUT_OF_SCOPE' if project == 'Saint-gobain' else 'REVIEW'), note
            if canonical:
                canonical_row = db.execute("SELECT keyword FROM keywords WHERE project_name=? AND keyword=? COLLATE NOCASE",
                                           (project,canonical)).fetchone()
                assert canonical_row, canonical
                canonical = canonical_row[0]
            stamp = now if selected else observation["checked_at"] if observation else historical.get("checkedDate") if historical else None
            sample_status = ("NOT_CHECKED" if outcome == "NOT_CHECKED" else "SCOPE_CHECKED") if selected else observation["status"] if observation else "ARCHIVED" if historical else "NOT_CHECKED"
            samples = observation.get("results", [])[:10] if observation else []
            if historical:
                samples.append({"title":historical.get("evidence"),"url":historical.get("url"),"archived":True})
            db.execute("""INSERT INTO keyword_platform_audit VALUES(?,?,?,?,?,?,?,?,?,?)
                          ON CONFLICT(project_name,keyword,platform) DO UPDATE SET status=excluded.status,
                          canonical_keyword=excluded.canonical_keyword,reason=excluded.reason,search_url=excluded.search_url,
                          sample_status=excluded.sample_status,checked_at=excluded.checked_at,samples_json=excluded.samples_json""",
                       (project,q,platform,outcome,canonical,reason,query_url(platform,q),sample_status,stamp,encode(samples)))
    db.execute("DELETE FROM news_keyword_aliases")
    aliases = [*NEWS_ALIASES, *overlapping_news_aliases(db, set(manual))]
    db.executemany("INSERT INTO news_keyword_aliases VALUES(?,?,?,?,?,?)", [(*alias,now) for alias in aliases])
    return {k: dict(Counter(row["status"] for row in v.values())) for k,v in collected.items()}


def overlapping_news_aliases(db, manual):
    groups = defaultdict(list)
    for project, keyword, level, subjects, samples in db.execute("""SELECT a.project_name,a.keyword,k.level,k.subjects_json,a.samples_json
        FROM keyword_platform_audit a JOIN keywords k USING(project_name,keyword)
        WHERE a.platform='news' AND a.status='READY'"""):
        if (project,keyword.casefold()) in manual:
            continue
        subject = tuple(sorted({phrase(s) for s in json.loads(subjects) if isinstance(s,str) and phrase(s)}))
        article_ids = {r["url"].split("?")[0] for r in json.loads(samples) if r.get("publisher") and r.get("url")}
        if subject and len(article_ids) >= 6:
            groups[project,subject].append((keyword,level,article_ids))
    for (project,subject), rows in groups.items():
        kept = []
        for keyword, level, article_ids in sorted(rows, key=lambda x: (x[1], phrase(x[0]) not in subject,len(x[0]),x[0])):
            for canonical, canonical_level, primary_ids in kept:
                if level != canonical_level or not (exact(keyword,canonical) or exact(canonical,keyword)):
                    continue
                common = len(article_ids & primary_ids)
                if common < 6 or common * 5 < len(article_ids) * 4:
                    continue
                db.execute("""UPDATE keyword_platform_audit SET status='ALIAS', canonical_keyword=?,reason=?
                    WHERE project_name=? AND keyword=? AND platform='news'""",
                           (canonical, f"Cùng chủ thể trong plan và trùng {common}/{len(article_ids)} URL bài với {canonical}.",project,keyword))
                yield project,keyword,canonical,common,len(article_ids)
                break
            else:
                kept.append((keyword,level,article_ids))


def main():
    now = datetime.now(timezone.utc).isoformat()
    DECISIONS.extend(vinmec_specialty_decisions())
    with sqlite3.connect(DB.resolve().as_uri() + "?mode=rw", uri=True) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("BEGIN IMMEDIATE")
        changed = apply_keywords(db)
        make_views(db)
        coverage = add_channel_audit(db, now)
        reconcile_spelling(db)
        assert db.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        assert not db.execute("PRAGMA foreign_key_check").fetchall()
        assert db.execute("SELECT count(*) FROM news_search_queue WHERE Keyword LIKE '#%'").fetchone()[0] == 0
        totals = {p: dict(db.execute(f"SELECT Level,count(*) FROM {p}_search_queue GROUP BY Level")) for p in PLATFORMS}
        states = defaultdict(dict)
        for platform, status, count in db.execute("SELECT platform,status,count(*) FROM keyword_platform_audit GROUP BY 1,2"):
            states[platform][status] = count
        general = dict(db.execute("SELECT Level,count(*) FROM search_queue GROUP BY Level"))
        review = list(db.execute("SELECT project_name,keyword,level,reasons_json FROM keywords WHERE status='REVIEW' ORDER BY 1,2"))
        aliases = list(db.execute("SELECT project_name,alias,primary_keyword,shared_articles,sample_size FROM news_keyword_aliases ORDER BY 1,2"))
        social_hashtags = db.execute("SELECT count(*) FROM facebook_search_queue WHERE Keyword LIKE '#%'").fetchone()[0]
        new_keywords = db.execute("SELECT count(*) FROM keyword_quality_audit WHERE audit_id=? AND previous_status IS NULL", (AUDIT,)).fetchone()[0]
        checked = [{"project": p, "keyword": q, "level": l, "plan_reference": ref, "catalog_status": st,
                    "platforms": findings} for p,q,l,s,st,ref,findings,r in DECISIONS]
    summary = {"last_audited_at": now, "changes_this_run": changed, "general_queue_by_level": general, "platform_queue_by_level": totals,
               "platform_statuses": states, "public_search_samples": coverage, "direct_google_news_queries": len(NATIVE_NEWS),
               "direct_facebook_queries": 61, "facebook_ready_hashtags": social_hashtags, "new_catalog_keywords": new_keywords,
               "remaining_review_rows": len(review), "decisions": checked, "news_alias_overlaps": aliases}
    write_json(OUT / "keyword-platform-summary.json", summary)
    report = ["# Từ khóa đã đối chiếu theo kênh", "",
              "Facebook dùng chung cho TikTok, Threads và Instagram. YouTube và Google News có hàng đợi riêng. Google News chỉ nhận keyword thường.", ""]
    for row in checked:
        report.append(f"- **{row['project']} · {row['keyword']}** · Level {row['level']} · {row['plan_reference']}")
        for platform, (state, canonical, reason) in row["platforms"].items():
            alias = f" Dùng `{canonical}`." if canonical else ""
            report.append(f"  - {platform.title()} · {state}. {reason}{alias} [Mẫu tìm riêng]({query_url(platform,row['keyword'])})")
    report.extend(["", "## Keyword Google News trùng nhiều bài", ""])
    for project, alias, canonical, common, total in aliases:
        report.append(f"- **{project} · {alias}** dùng `{canonical}`. Trùng {common}/{total} URL. "
                      f"[Tìm cụm gốc]({query_url('news',alias)}) · [Tìm cụm chính]({query_url('news',canonical)})")
    report.extend(["", "## Những dòng còn REVIEW trong kho", ""])
    current = None
    for project, word, level, reasons in review:
        if project != current:
            current = project
            report.extend([f"### {project}", ""])
        report.append(f"- **{word}** · Level {level}. {json.loads(reasons)[-1]} "
                      + " · ".join(f"[{p.title()}]({query_url(p,word)})" for p in PLATFORMS))
    (OUT / "keyword-platform-report.md").write_text("\n".join(report)+"\n", encoding="utf-8")
    print(json.dumps({k:v for k,v in summary.items() if k not in {"decisions","changes_this_run"}}))


if __name__ == "__main__":
    main()
