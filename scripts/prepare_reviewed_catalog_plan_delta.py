"""Translate reviewed changes from the November 19 plan exports into catalog rows."""
import collections
import json
import re
from urllib.parse import urlsplit

from build_source_keyword_catalog import norm
from compare_catalog_plan_snapshot import ROOT
from extract_project_sources import read_book


def main():
    docs = {doc["id"]: doc for doc in json.loads((ROOT / "plan-diff.json").read_text(encoding="utf8"))}
    candidates = json.loads((ROOT / "candidate-delta.json").read_text(encoding="utf8"))
    chosen = {
        "sources": [], "keywords": [], "raw_keyword_cells": [], "content_references": [], "decisions": [],
        "new_project_issues": {
            "Xin chào thứ 7": {"issue": "CMS_LINK_ONLY", "note": "Main!D65 trỏ CMS, chưa có monitoring plan."},
            "Bênh Viện Sản Nhi Tây Ninh": {"issue": "SHARED_PROJECT_ID_NO_PLAN_LINK", "note": "Main!D66 trống; ID trùng dòng OPPO."},
            "OPPO": {"issue": "SHARED_PROJECT_ID_NO_PLAN_LINK", "note": "Có dòng running mới, Main!D67 trống; ID trùng dòng Bệnh viện Sản Nhi Tây Ninh."},
        },
        "retired_keywords": [{"project": "Saint-gobain", "keyword": "TikTok Shop",
                              "reason": "Roster Tháng 726!E1311:F1311 đã bỏ topic Tiktok Shop MS (63bbb7c603c39417860b288c). Đây là căn cứ duy nhất của dòng cũ."}],
    }

    def raw(project, sheet, column, number, text, kind, plan_url, **info):
        original = dict(project=project, sheet=sheet, cell=f"{column}{number}", text=text, kind=kind, plan_url=plan_url, **info)
        chosen["raw_keyword_cells"].append(original)
        return original

    def keyword(project, query, subject, level, original, status="READY", evidence=(), reason=""):
        chosen["keywords"].append(dict(project=project, keyword=query, subject=subject, level=level, status=status,
                                       originals=[original], evidence=list(evidence), reasons=[reason] if reason else []))

    def book(doc_id):
        doc = docs[doc_id]
        return doc["url"], {sheet["name"]: sheet["rows"] for sheet in read_book(doc["current_file"])}

    finance_url, finance = book("1HgWRvIYXLoaB2xkBnrp5K76OUMv6OuQ4")
    finance_projects = ("Home Credit", "Ngành tài chính")
    for number in range(34, 40):
        row = finance["Brand list"][number]
        name, platform, link = (row[c]["text"].strip() for c in "EFH")
        assert name in {"Lotte Finance", "VietCredit"} and row["D"]["text"].strip() == "Competitor"
        chosen["sources"].append(dict(channel=platform.casefold(), link=link, name=name,
            origins=[dict(project=p, planUrl=finance_url, sheet="Brand list", cell=f"H{number}", listed_role="Competitor",
                          observed_note=row["I"]["text"].strip()) for p in finance_projects]))
    for number, expected in ((72, "Lotte Finance"), (73, "VietCredit")):
        row = finance["Bộ Keywords Brand chính"][number]
        assert row["A"]["text"].strip() == expected
        for project in finance_projects:
            primary = raw(project, "Bộ Keywords Brand chính", "B", number, row["B"]["text"], "main", finance_url, topic=expected)
            raw(project, "Bộ Keywords Brand chính", "D", number, row["D"]["text"], "hashtag", finance_url, topic=expected)
            evidence = ["Plan Brand list!D34:D39 ghi Competitor và tên thương hiệu."]
            if expected == "VietCredit":
                evidence.append("https://www.vietcredit.vn/thong-bao/thong-bao-cap-nhat-thay-doi-ten-cong-ty-vietcredit")
            keyword(project, expected, expected, 2, primary, evidence=evidence,
                    reason="Dùng tên thương hiệu đứng riêng; các tên viết tắt/hashtag giữ làm alias.")

    for section in candidates:
        doc_id, sheet = section["id"], section["sheet"]
        if section["projects"][0][0] == "Be App":
            new_accounts = collections.defaultdict(list)
            for item in section["changes"]:
                for link in item["new_links"]:
                    chosen["content_references"].append(dict(project="Be App", link=link, plan_url=section["url"], sheet=sheet, cell=item["cell"]))
                    url = urlsplit(link)
                    handle = re.fullmatch(r"/(@[\w.]+)/(?:video|post)/[\w-]+/?", url.path)
                    if handle and url.hostname in {"www.tiktok.com", "www.threads.com"}:
                        profile = f"https://{url.hostname}/{handle[1]}"
                        new_accounts[profile].append(dict(project="Be App", planUrl=section["url"], sheet=sheet,
                            cell=item["cell"], from_post_url=link, account_evidence="explicit author handle in post URL"))
            for link, origins in new_accounts.items():
                platform = "tiktok" if ".tiktok." in link else "threads"
                chosen["sources"].append(dict(channel=platform, link=link, name=link.rsplit("/", 1)[-1], origins=origins))
        elif section["projects"][0][0] == "Zalopay" and sheet == "2. Keyword Zalopay & Competitor":
            columns = {
                "C": "ZaloPay", "H": "MoMo", "M": "ViettelPay", "R": "ShopeePay", "W": "VNPay",
            }
            for item in section["changes"]:
                column = re.match(r"[A-Z]+", item["cell"])[0]
                if column in columns and item["row"] > 3 and item["text"]:
                    raw("Zalopay", sheet, column, item["row"], item["text"], "sub", section["url"], topic=columns[column])
        elif section["projects"][0][0] == "ShopeeFood" and sheet == "Tracking Keyword (2026)":
            for item in section["changes"]:
                column = re.match(r"[A-Z]+", item["cell"])[0]
                if column in {"D","E"}:
                    raw("ShopeeFood", sheet, column, item["row"], item["text"],
                        "hashtag" if column == "D" else "sub", section["url"], topic="Campaign Livestream")
        elif doc_id == "16OhKOMqK5d2j6fI09GxKyfXh5L3WEkbZmUALe8dLlDw" and sheet == "Từ khóa_Thương hiệu chung":
            item = next(i for i in section["changes"] if i["cell"] == "B32")
            assert item["text"] == "Motio"
            original = raw("Vinfast", sheet, "B", 32, item["text"], "main", section["url"], topic="Motio")
            keyword("Vinfast", "VinFast Motio", "Motio", 1, original,
                    evidence=["https://vinfastauto.com/vn_vi/vinfast-thong-bao-ap-dung-chinh-sach-gia-moi-cho-cac-dong-xe-may-dien",
                              "https://www.youtube.com/watch?v=nYhqS7EQWGE"],
                    reason="Tên mẫu xe đứng độc lập theo tên sản phẩm VinFast Motio; không dùng các biến thể ghép điều kiện.")

    vinmec_url, vinmec = book("1Ttwd8vNxrF249JvFJOfrBZALD8cMXRwe")
    mental_sheet = "Sức khoẻ tinh thần"
    keep_review = {"stress", "stressam", "tâm thần", "non stress test là gì", "điều gì làm bạn cảm thấy lo âu trong cuộc sống",
                   "tâm lý fomo là gì", "rối loạn sắc giác", "rối loạn đông máu", "rối loạn thái dương hàm"}
    seen_topics = set()
    for number, row in sorted(vinmec[mental_sheet].items()):
        if number < 2:
            continue
        title = row.get("C", {}).get("text", "").strip()
        parent = row.get("E", {}).get("text", "").strip()
        variations = row.get("D", {}).get("text", "").strip()
        if not title:
            continue
        original = raw("Vinmec", mental_sheet, "C", number, title, "sub" if parent else "main",
                       vinmec_url, parent_keyword=parent or None)
        if variations:
            raw("Vinmec", mental_sheet, "D", number, variations, "alias", vinmec_url, parent_keyword=title)
        topic_key = norm(title)
        if parent or topic_key in seen_topics:
            continue
        seen_topics.add(topic_key)
        status = "REVIEW" if title in keep_review else "READY"
        keyword("Vinmec", "ADHD" if title == "adhd" else title, title, 2, original, status,
                evidence=["Tab Sức khoẻ tinh thần, cột Keyword có chủ đề độc lập và Parent_Keyword trống."],
                reason="Cần rà từ quá rộng, lỗi viết hoặc lệch phạm vi sức khoẻ tinh thần." if status=="REVIEW" else
                       "Chủ đề ngành trong plan. Biến thể và câu có Parent_Keyword chỉ giữ để đối chiếu.")

    saint_url, saint = book("1IfIPWkTMhOGJN53rW4ZA0ZTb4hM3IoPZNoxtA5BXbyE")
    for number, group, queries in (
        (5, "Bán gạch & VLXD", ["gạch ốp lát", "gạch men"]),
        (6, "Xây dựng & thi công", ["thiết kế nhà đẹp", "xây nhà trọn gói"]),
    ):
        sheet = "Adhoc - List tiktok"
        original = raw("Saint-gobain", sheet, "D", number, saint[sheet][number]["D"]["text"], "main", saint_url,
                       topic=group, scope="TikTok adhoc: 01/08/2026–31/10/2026")
        for query in queries:
            keyword("Saint-gobain", query, group, 2, original, "REVIEW",
                    reason="Từ khóa ngành cho yêu cầu TikTok theo kỳ adhoc; cần xác nhận phạm vi trước khi search xuyên nền tảng.")

    masan_url, masan = book("1vsMn_o2wf5tGmIgsU2CJf-Uoe3n3J4jLb1WWNI39eLc")
    for column, kind in (("B","main"),("C","sub")):
        raw("Masan", "Alert BLĐ", column, 2, masan["Alert BLĐ"][2][column]["text"], kind, masan_url, topic="BLĐ")
    chosen["decisions"].extend([
        dict(project="Masan", subject="BLĐ", original="Alert BLĐ!B2:C2", level=1, decision="ES_ONLY",
             reason="Tên lãnh đạo là Sub key của cảnh báo Masan; kho đã có Masan Group đứng riêng."),
        dict(project="Zalopay", subject="QR", original="2. Keyword Zalopay & Competitor", level=2, decision="ES_ONLY",
             reason="Thay đổi ở các cột Sub-Keywords; các cột Main Keywords không có cụm mới."),
        dict(project="ShopeeFood", subject="Campaign Livestream", original="Tracking Keyword (2026)!D5:E5", level=1,
             decision="ES_ONLY", reason="JSOL/HYO và alias đi kèm chiến dịch, không phải truy vấn độc lập về ShopeeFood."),
    ])
    (ROOT / "reviewed-additions.json").write_text(json.dumps(chosen, ensure_ascii=False, indent=2), encoding="utf8")
    print({key: len(value) for key, value in chosen.items()})
    print("keywords by project", dict(collections.Counter((k["project"], k["status"]) for k in chosen["keywords"])))


if __name__ == "__main__":
    main()
