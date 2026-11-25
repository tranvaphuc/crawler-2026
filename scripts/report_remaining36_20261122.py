import json
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
root=Path('outputs/news-remaining36-2026-11-22')
read=lambda name: json.loads((root/name).read_text(encoding='utf-8'))
post,apply,routes=map(read,['postcheck.json','apply-result.json','routes.json'])
notes={
'2saigon.vn':'DNS ENOTFOUND khi kiểm tra trực tiếp; proxy ECONNRESET. Cần domain/DNS hoạt động trở lại.',
'autovina.com':'Bật lại source sau 6 bài vượt kiểm tra native clock/body; giới hạn 1 bài đồng thời. Seed và article còn có timeout rải rác.',
'coindesk.com':'RSS chính thức trả 200 và 25 item qua proxy. Trang bài vẫn 429; chưa bật parser dựa vào RSS tóm tắt.',
'dailo.vn':'Chứng thư hết hạn ở cả apex và www. Giữ xác minh TLS.',
'danhgiaxe.com':'Đã thử 6 bài không phải video. Các clock tìm được thuộc bài liên quan; không lấy clock của bài khác.',
'dulichgiaitri.com':'Bài chỉ có ngày, thiếu original clock. Feed đã thử không cung cấp pubDate hợp lệ.',
'edition.cnn.com':'Trang trả 403; RSS cnn bị reset trên cả đường trực tiếp và proxy.',
'emagazine24.net':'Trang trả 403 trên đường trực tiếp và proxy.',
'finance.biggo.com':'Homepage trực tiếp đọc được; bài qua proxy vẫn 403 và source còn publication quarantine.',
'forum.autodaily.vn':'6 bài native vượt kiểm tra với cấu hình hiện hành; mở seed đã xác minh. Snapshot cuối 9/9 seed ok. Còn lịch sử fail từng URL.',
'giacavattu.com.vn':'Tôn trọng crawl-delay 2129 giây. Replay chứng cứ đã lưu chỉ thấy ngày Cập nhật, chưa chứng minh giờ đăng gốc.',
'gialaitv.vn':'Clock trong bài ghi Cập nhật; RSS publisher khai báo trả 403. Chưa có original publication proof.',
'hanoitimes.vn':'Homepage/RSS index trả 401; source chưa đủ điều kiện publication, giữ quarantine.',
'kinhdoanhtieudung.thuonggiaonline.vn':'Hết cảnh báo discovery, nhưng mẫu bài hiện tại có clock hiển thị 07:37 khác metadata 08:07. Không coi việc hết cảnh báo là đã sửa parser.',
'kinhte24h.net.vn':'Sửa selector sang original article:published_time, đối chiếu visible clock. JSON-LD cũ trỏ google.com/article. 8 bài qua gate; 7 bài đã tạo ES, 1 URL vẫn timeout. Giới hạn 1 bài đồng thời.',
'kinhteplus.com.vn':'Chứng thư hết hạn ở cả apex và www.',
'laodongdongnai.vn':'HTTP 500 từ website, xác nhận cả đường trực tiếp.',
'molistar.com':'HTTP 520 từ website.',
'ngoisaovietnam.vn':'Homepage có link nhưng cả 6 bài được thử trả 404.',
'nguoinoitieng.vn':'Domain chuyển đến /cgi-sys/suspendedpage.cgi; không có bài để khám phá.',
'nhansac.vn':'Declared WordPress post API có date_gmt, nhưng 5 mẫu trước chỉ có 2 content hash khác nhau. Không kích hoạt bằng body trùng. RSS trả 403.',
'saoexpress.vn':'Website trả 403.',
'taichinhplus.com.vn':'6 bài vượt strict native publication/body; phục hồi seed đã xác minh. Một số category vẫn timeout rải rác.',
'tamnhin.kienthuc.net.vn':'Direct homepage có link; proxy reset cả homepage và 6 bài được thử. Chưa có route proxy ổn định.',
'thoibaobatdongsan.net':'HTTP 200 nhưng không có bài news hợp lệ để khám phá; không tính HTTP 200 là phục hồi.',
'thuonghieudoanhnhan.net.vn':'7 bài qua gate cuối; giảm xuống 1 bài đồng thời. 6 URL mở lại đã tạo ES; category còn timeout rải rác.',
'tieudungplus.vn':'Apex timeout; www trả 404. Chưa có route bài hợp lệ được xác minh.',
'tieudungso.vn':'Proxy EPROTO, direct timeout; www cũng EPROTO.',
'tieudungthoinay.vn':'Direct apex 404; alias www reset/timeout.',
'tintuctoday.net':'6 bài hiện tại không có original publication clock; feed/sitemap thử không cung cấp clock. Không dùng ngày sự kiện trong body.',
'travelguide.org.vn':'Không có original publication clock trong chứng cứ bài. Feed thử không có pubDate hợp lệ; một số request timeout.',
'travelteam.vn':'Hết cảnh báo discovery nhưng bài hiện tại có JSON-LD không gắn URL và metadata thiếu corroboration; 7 mẫu cuối vẫn bị gate giữ.',
'truyenhinh.baobinhduong.vn':'Timeout qua các route đã thử.',
'vietnamfdi.vn':'Đã tải homepage/bài; selector clock khớp nhiều article-meta ở các khối khác nhau, chưa có original timezone proof. Còn timeout.',
'vinh24h.vn':'Đường trực tiếp trả 403; proxy vẫn timeout ở snapshot.',
'vntravel.org.vn':'4 bài qua strict gate với cấu hình hiện hành. Homepage duy nhất lại timeout trong vòng live kế tiếp; chưa coi là ổn định. Không tìm được category seed công bố trong discovery đã lưu.'
}
verified={s['site']:s for name in ['verified-sources.json','verified-extra.json'] for s in read(name)['sites']}
rows=[]
for s in post['sites']:
    v=verified.get(s['site'],{})
    rows.append({**s,'nativeSamplesPassed':sum(bool(p.get('doc')) for p in v.get('pages',[])),
                 'notes':notes[s['site']]})
disposition={'checkedAt':post['at'],'cohortSize':len(rows),'discoveryAlerting':post['cohortAlerting'],
             'discoveryWithoutAlerts':post['cohortHealthy'],'paidAiQcCalls':0,'paidAiQcUsd':0,'sites':rows}
(root/'source-disposition.json').write_text(json.dumps(disposition,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
receipts=Counter(p.get('receipt',{}).get('status') for p in post['reopenedArticles'] if p.get('receipt'))
stamp=(datetime.fromisoformat(post['at'].replace('Z','+00:00'))+timedelta(hours=7)).strftime('%d/%m/%Y %H:%M:%S UTC+7')
ledger_unchanged=routes['aiUsage']==post['aiUsage']
assert read('es-readback.json')['verified'] and len(read('es-readback.json')['results'])==13
assert all(c['sha']==c['expectedSha'] for c in post['configReadback'])
text=f'''QC tiếp 36 nguồn news — {stamp}

Đã triển khai thực tế:
- Kinhte24h: thay JSON-LD trỏ URL mẫu google.com/article bằng metadata original article:published_time đã được visible clock corroborate. 8 mẫu qua gate, gồm 3 bài holdout mới.
- Autovina: bật lại sau 6 bài native đạt chuẩn. Autovina, Kinhte24h và Thương Hiệu Doanh Nhân chạy tối đa 1 article đồng thời mỗi nguồn để giảm request đồng thời vào các host chậm.
- Kiểm chứng 6 nguồn bằng parser hiện hành/frozen config và nhiều body riêng biệt: forum.autodaily.vn, taichinhplus.com.vn, vntravel.org.vn, kinhte24h.net.vn, autovina.com, thuonghieudoanhnhan.net.vn.
- Phục hồi đúng {len(apply['seeds'])} seed có HTML và link thật. Những quan sát mới hơn được giữ nguyên; không xóa lỗi cả site.
- Mở lại 14 URL bài có bằng chứng. Cuối lượt: 13/14 đã được importer tạo vào ES, đọc lại 13/13 khớp native title/content/description/url/publication và identity. 1 URL Kinhte24h vẫn timeout, giữ lỗi thật.

Trạng thái cuối:
- Trong đúng cohort 36: {post['cohortHealthy']} nguồn không còn cảnh báo discovery, {post['cohortAlerting']} nguồn còn cảnh báo. Chỉ số dao động 28–29 do VNTravel timeout trở lại.
- Năm nguồn có mẫu native đạt và không có cảnh báo discovery ở snapshot cuối: forum.autodaily.vn, taichinhplus.com.vn, kinhte24h.net.vn, autovina.com, thuonghieudoanhnhan.net.vn. Các nguồn này vẫn có lịch sử lỗi từng URL; không tuyên bố mọi URL đã sạch lỗi.
- VNTravel qua parser nhưng seed duy nhất timeout trở lại. Thử tìm category seed từ discovery đã lưu không có kết quả, không thêm đường dẫn đoán.
- Kinhdoanhtieudung và Travelteam không có cảnh báo discovery hiện tại, nhưng mẫu publication hiện tại vẫn fail. Không coi hai nguồn này là đã sửa xong chỉ vì còn lịch sử parse thành công.
- Phần còn lại có lỗi website (DNS/TLS/401/403/429/404/500/520/reset/timeout), không còn bài news, hoặc thiếu chứng cứ original publication. Các trường hợp này chưa được khôi phục đầy đủ; AI không thể thay thế clock/content mà publisher không cung cấp.

An toàn dữ liệu và xác minh:
- News seed/parse/import đều active, NRestarts=0 sau triển khai. Import giữ PID 1161405.
- Ba cấu hình sửa trên VPS đọc lại hash khớp; local chỉ đồng bộ đúng các key đã sửa, giữ thay đổi không liên quan.
- 34 regression tests pass (32 strict publication/recovery/feed/original contract + 2 publisher concurrency). Chỉ dùng mock/local cho test.
- Backup chọn lọc file/state nằm ở /var/lib/news-flow/qc-remaining36-20261122/apply-before.json và cap-before.json; giữ tích lũy ai_usage.
- Paid AI API do lượt QC này gọi: 0, chi phí 0 USD trong tổng 15 USD đã cấp. Không dùng Astra. Ledger đầu/cuối bằng nhau: {ledger_unchanged}.
- Giữ AI_DAILY_BUDGET_USD=2, AI_DAILY_MAX_CALLS=200, NEWS_AI_MODEL=gpt-5.4-mini. Không reset ledger, không thêm FireAnt.

Chi tiết từng nguồn (cảnh báo discovery và giới hạn còn lại):
'''
for s in rows:
    text+=f"\n{s['site']} | {', '.join(s['alerts']) or 'không có cảnh báo discovery'}\n{s['notes']}\n"
text+='\nChứng cứ: source-disposition.json, routes.json, articles.json, feeds.json, last-routes.json, extra-articles.json, verified-sources.json, verified-extra.json, apply-result.json, after-cap-verification.json, after-cap-reopen.json, postcheck.json, es-readback.json. HTML gzip gốc lưu trên VPS cùng thư mục QC.\n'
(root/'QC-REPORT.txt').write_text(text,encoding='utf-8')
print(json.dumps({'report':str(root/'QC-REPORT.txt'),'cohort':len(rows),'alerting':post['cohortAlerting'],'createdReceipts':receipts['created'],'esReadback':13,'aiLedgerUnchanged':ledger_unchanged},ensure_ascii=False))
