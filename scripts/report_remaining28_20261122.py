import json
from collections import Counter
from pathlib import Path

root = Path('outputs/news-remaining28-2026-11-22')
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
post = read(root/'postcheck.json')
prior = read(Path('outputs/news-remaining29-2026-11-22/source-disposition.json'))
routes = read(root/'routes.json')
details = {s['site']: s for s in prior['sites']}
notes = {
    'finance.biggo.com': 'Bài trực tiếp HTTP 200 có NewsArticle/datePublished/meta trùng nhau và nội dung 5187 ký tự. Ba URL bài qua proxy đều 403. Đã đọc JS gốc khai báo API GET; /api/v1/finance/news/home/list?region=us và /news/list?region=us qua proxy đều ECONNREFUSED. Giữ quarantine theo đường truyền production; chưa đủ holdout/đường proxy hợp lệ.',
    'tintuctoday.net': 'HTML thiếu giờ đăng gốc. Hai API frontend /api/posts/homepage?page=1&limit=20 và page=2, cùng /api/posts đều HTTP 500; /api/posts/82522 trả 404. Không suy đoán giờ đăng từ ID/URL.',
    'danhgiaxe.com': 'Đã kiểm tra sitemap.xml chính chủ HTTP 200; chỉ có URL, không có news:publication_date. Bài chỉ nêu Chỉnh sửa lúc theo ngày; đồng hồ thẻ liên quan không phải ngày đăng bài.',
    'dulichgiaitri.com': 'Sitemap.xml chính chủ HTTP 200 chỉ có URL/changefreq/priority, không có publication_date. Bài thiếu đồng hồ đăng gốc đủ giờ/phút/timezone; không dùng thời gian cập nhật thay thế.',
    'edition.cnn.com': 'RSS HTTP khai báo trả 50 item cũ năm 2023, không có pubDate hợp lệ; không thể dùng làm nguồn thời gian hiện tại. Trang bài/homepage vẫn 403 và RSS HTTPS reset.',
    'thoibaobatdongsan.net': 'HTML chính chủ thông báo Trang này không may bị đóng; trang còn headline cũ nhưng không có liên kết bài hiện hành. Không coi HTTP 200 là đã khôi phục news.',
}
rows = []
for status in post['sites']:
    old = details.get(status['site'], {})
    row = {**old, **status}
    if 'currentHttp' in row:
        row['earlierHttpEvidence'] = row.pop('currentHttp')
        row['earlierEvidenceCheckedAt'] = prior['checkedAt']
    current = next((s for s in routes['sites'] if s['site'] == status['site']), None)
    if current:
        row['thisPassHttp'] = [{k: p.get(k) for k in ['url', 'error', 'statusCode', 'file']} for p in current['checks']]
    if status['site'] in notes:
        row['notes'] = notes[status['site']]
    if status['site'] == 'tieudungplus.vn':
        row.update(category='restored', notes='Khôi phục bằng RSS gốc 60 bài và mobile do publisher khai báo; 3 training + 2 holdout độc lập, 5 bản ES created/readback khớp. URL/ID gốc được giữ. Seed production đã phát hiện 60 link, 9 link mới.')
    rows.append(row)
remaining = [r for r in rows if r['alerts']]
out = {'checkedAt': post['at'], 'cohortSize': 28, 'alerting': len(remaining), 'createdAndReadBack': len(post['esReadback']), 'paidAiApiCalls': 0, 'paidAiApiUsd': 0, 'remainingCategories': dict(Counter(r['category'] for r in remaining)), 'sites': rows}
(root/'source-disposition.json').write_text(json.dumps(out, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
assert post['verified'] and len(remaining) == 27
text = f'''QC 28 nguồn news — {post['at']}

Kết quả: khôi phục Tiêu Dùng Plus; còn 27 nguồn cảnh báo thật.

Tiêu Dùng Plus:
- RSS https://tieudungplus.vn/rss/moi-nhat.rss cung cấp 60 bài và pubDate có GMT.
- Bản mobile được chính HTML publisher khai báo, canonical trỏ đúng URL desktop. Adapter chỉ áp dụng bài HTTPS của tieudungplus.vn; xác minh canonical, headline, nội dung đầy đủ và không có paywall.
- Không sửa HTML gốc hay tự tạo timestamp. Giữ URL gốc và ID ES; giờ đăng lấy từ RSS khớp đúng URL, không dùng nhãn Cập nhật trên mobile.
- Cấu hình đóng băng trước 3 bài training + 2 holdout độc lập: 5/5 qua các gate nội dung, publication, timezone và canonical. Năm URL từng lỗi đã được requeue có chọn lọc, ES created 5/5 và đọc lại khớp URL/title/content/description/publishedDate.
- Seed RSS đã chạy trong luồng production, phát hiện 60 link và bổ sung 9 link mới vào hàng đợi.

Kiểm tra còn lại:
- BigGo: nội dung gốc trực tiếp đầy đủ, nhưng 3 bài qua proxy đều 403, hai API GET frontend khai báo đều ECONNREFUSED. Giữ quarantine; luồng production vẫn chạy qua proxy.
- TintucToday: các API danh sách public đều 500; API một bài đã kiểm tra 404.
- Danhgiaxe/Dulichgiaitri: sitemap gốc không cung cấp ngày xuất bản; không dùng ngày sửa bài hoặc ngày liên quan để lấp thiếu.
- CNN: HTTP RSS chỉ có 50 item cũ năm 2023 và không có pubDate; homepage/article vẫn bị chặn.
- Các nguồn khác vẫn có bằng chứng DNS, TLS hết hạn/handshake, upstream 4xx/5xx/reset/timeout, site đóng/suspended, thiếu giờ đăng gốc hoặc nội dung lặp sai bài. Chi tiết đủ 27 nguồn nằm trong source-disposition.json. Giacavattu được giữ theo crawl delay của publisher, không quét dồn.

Xác minh:
- Local: 38/38 kiểm tra parser, publication, feed identity và adapter đạt.
- VPS: 39/39 kiểm tra tương ứng bản live, gồm HTTP transport, đạt. Trên Windows sandbox, 6 HTTP loopback test bị EACCES; không sửa logic test để bỏ qua, đã chạy thành công bộ HTTP tương ứng trên VPS.
- Bốn file triển khai khớp SHA-256. Seed/parse/import active, NRestarts=0; importer giữ nguyên PID 1161405.
- Bản sao lưu trước triển khai: /var/lib/news-flow/qc-remaining28-20261122/mobile-apply-before.json. Lần replay đầu dừng vì so sánh insertedDate sinh theo thời điểm; cấu hình/code đã tự rollback rồi so sánh lại với cùng mốc insertedDate, sau đó mới triển khai thành công.
- Không gọi AI API trả phí trong lượt này: 0 USD, không dùng Astra. Ledger ai_usage được giữ nguyên. AI_DAILY_BUDGET_USD vẫn 2, hạn mức ngày UTC và tổng ngân sách QC 15 USD không đổi.
- Không thêm nguồn fireant.vn hoặc tên miền con.

Artefact: postcheck.json, mobile-qualified.json, mobile-apply-result.json, seed-verified.json, test-local.txt, test-vps.txt, public-followup.json, biggo-public-api.json, source-disposition.json.
'''
(root/'QC-REPORT.txt').write_text(text, encoding='utf-8')
print(json.dumps({k: out[k] for k in ['cohortSize','alerting','createdAndReadBack','remainingCategories']}))
