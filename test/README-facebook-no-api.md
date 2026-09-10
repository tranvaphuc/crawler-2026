# Lấy post Facebook page không dùng Graph API

## ⚠️ Tình trạng hiện tại (2025–2026)

**Thư viện Python `facebook-scraper`** hiện thường **trả về 0 post**: Facebook đã đổi cấu trúc HTML, thư viện (ít cập nhật) không còn tìm thấy bài viết. [Issue #1102](https://github.com/kevinzg/facebook-scraper/issues/1102), [#1076](https://github.com/kevinzg/facebook-scraper/issues/1076).

**Khuyến nghị:** Dùng **Graph API + token** (ổn định): script `test/get-page-posts-2026.js` với biến môi trường `GRAPH_ACCESS_TOKEN` (lấy 1 token từ `tokenEAAD.txt`).

```bash
GRAPH_ACCESS_TOKEN="EAAD..." node test/get-page-posts-2026.js
```

---

## Các cách không cần token/API chính thức (có thể không hoạt động)

### 1. **Python: facebook-scraper**

- **Repo:** https://github.com/kevinzg/facebook-scraper
- **Cài:** `pip install facebook-scraper` + `pip install lxml_html_clean` nếu cần.
- Hiện tại **get_posts() thường trả về rỗng** do thay đổi HTML của Facebook. Có thể thử với **cookies** (export từ trình duyệt đã đăng nhập): `--cookies path/to/cookies.txt`.

---

### 2. **Dịch vụ Apify (trả phí)**

- **Facebook Public Pages Scraper** – không cần API key, có free tier.
- **Facebook Page Posts Scraper** – trả phí theo số kết quả.
- Dùng qua Apify API (JavaScript/Python), export JSON/CSV.

---

### 3. **Node.js**

- **facebook-nologin-scraper** (npm): chủ yếu scrape **profile** (tên, avatar, education…), **không** lấy post page.
- **facebook-group-posts-scraper**: dành cho **group**, không phải page.
- Hiện không có thư viện Node ổn định, không token, chuyên lấy **post page**; nên dùng Python **facebook-scraper** nếu muốn không API.

---

### 4. **RSS / bridge**

- **RSSHub**, **RSS-Bridge**: có bridge tạo RSS từ page Facebook (đọc qua RSS thay vì gọi API trực tiếp). Vẫn phụ thuộc scrape/phương thức không chính thức phía backend.

---

## Kết luận

- **Không dùng Graph API:** Cách thực tế nhất là **scrape** (Python **facebook-scraper**) hoặc dịch vụ bên thứ 3 (Apify).
- **Rủi ro:** Vi phạm ToS Facebook, có thể bị chặn IP/account; cấu trúc HTML/anti-bot thay đổi có thể làm scraper lỗi.
- **Hợp quy hơn:** Dùng **Graph API + access token** (như script `get-page-posts-2026.js` với `GRAPH_ACCESS_TOKEN`).
