#!/usr/bin/env python3
"""
Lấy post của page Facebook trong năm chỉ định - KHÔNG dùng Graph API / token.

Yêu cầu: pip install facebook-scraper (+ lxml_html_clean nếu lỗi).

Lưu ý: Facebook đổi HTML nên get_posts() hiện thường trả về 0 post. Nếu vậy,
dùng script có token: GRAPH_ACCESS_TOKEN=... node test/get-page-posts-2026.js

Chạy:
  python test/get-page-posts-2026-no-api.py --no-year-filter --debug
  python test/get-page-posts-2026-no-api.py --page-id 542674398935650 --year 2026 --cookies cookies.txt
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from facebook_scraper import get_posts


def _normalize_time(dt):
    """Đưa datetime về dạng so sánh được: naive UTC."""
    if dt is None:
        return None
    if getattr(dt, "tzinfo", None) is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def main():
    parser = argparse.ArgumentParser(description="Scrape Facebook page posts (no API)")
    parser.add_argument("--page-id", default="542674398935650", help="Page ID or page name")
    parser.add_argument("--year", type=int, default=2026, help="Year to filter posts")
    parser.add_argument("--pages", type=int, default=20, help="Number of pages to fetch")
    parser.add_argument("--output", default="test/page-posts-2026-no-api.json", help="Output JSON path")
    parser.add_argument("--no-year-filter", action="store_true", help="Lấy tất cả post, không lọc theo năm")
    parser.add_argument("--cookies", default=None, help="Đường dẫn file cookies (Netscape/JSON) để đăng nhập, giúp lấy được nhiều page hơn")
    parser.add_argument("--debug", action="store_true", help="In từng post khi lấy (time, post_id)")
    args = parser.parse_args()

    since = datetime(args.year, 1, 1, tzinfo=timezone.utc).replace(tzinfo=None)
    until = datetime(args.year, 12, 31, 23, 59, 59, tzinfo=timezone.utc).replace(tzinfo=None)
    posts_filtered = []
    total_fetched = 0
    total_with_time = 0

    kwargs = {"pages": args.pages, "options": {"posts_per_page": 200}}
    if args.cookies:
        kwargs["cookies"] = args.cookies

    for post in get_posts(args.page_id, **kwargs):
        total_fetched += 1
        post_time = post.get("time")
        if args.debug:
            print(f"  [#{total_fetched}] time={post_time} post_id={post.get('post_id')} text={str(post.get('text') or '')[:50]}...")
        if post_time is None:
            continue
        total_with_time += 1
        t = _normalize_time(post_time)
        if t is None:
            continue
        in_range = since <= t <= until
        if args.no_year_filter or in_range:
            posts_filtered.append({
                "post_id": post.get("post_id"),
                "text": post.get("text"),
                "time": post_time.isoformat() if post_time else None,
                "post_url": post.get("post_url"),
                "likes": post.get("likes"),
                "comments": post.get("comments"),
                "shares": post.get("shares"),
                "image": post.get("image"),
            })
        if not args.no_year_filter and t < since:
            break

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(posts_filtered, f, ensure_ascii=False, indent=2)

    print(f"Đã lấy: {total_fetched} post (có time: {total_with_time})")
    print(f"Trong năm {args.year}: {len(posts_filtered)} post")
    print(f"Đã ghi: {out_path}")
    if total_fetched == 0:
        print("Gợi ý: facebook-scraper hiện thường trả 0 post (Facebook đổi HTML). Dùng Graph API + token:")
        print("  GRAPH_ACCESS_TOKEN=<token từ tokenEAAD.txt> node test/get-page-posts-2026.js")
    elif len(posts_filtered) == 0:
        print("Gợi ý: Chạy với --no-year-filter để lấy toàn bộ post, hoặc page chưa có post trong năm này.")


if __name__ == "__main__":
    main()
