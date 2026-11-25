"""Complete one-pass closeout for every source; unavailable sources remain visible."""
import json
from collections import Counter
from pathlib import Path
from datetime import datetime, timedelta
root = Path('outputs/news-remaining27-all-2026-11-22')
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
base, native, extra, post = [read(root/f) for f in ['all-probe.json','native-routes.json','declared-extra.json','postcheck.json']]
prior = {s['site']:s for s in read(Path('outputs/news-remaining28-2026-11-22/source-disposition.json'))['sites']}
notes = {
 '2saigon.vn': ('publisher_dns','DNS A không phân giải được; hai hostname qua proxy đều reset.','Publisher cần khôi phục DNS; không ghim IP cũ.'),
 'coindesk.com': ('publisher_access','Homepage và bài đều 429; RSS gốc trả 25 item nhưng chỉ có tóm tắt.','Cần quyền/đường đọc nội dung đầy đủ được publisher hỗ trợ; không thay body bằng RSS excerpt.'),
 'dailo.vn': ('publisher_tls','Apex/www và đường HTTP chuyển tiếp đều CERT_HAS_EXPIRED; mobile timeout.','Publisher cần gia hạn chứng chỉ TLS; giữ xác minh TLS.'),
 'kinhteplus.com.vn': ('publisher_tls','Chứng chỉ TLS hết hạn ở cả apex/www; HTTP chuyển tiếp vẫn lỗi TLS.','Publisher cần gia hạn chứng chỉ TLS.'),
 'tieudungso.vn': ('publisher_tls','HTTPS lỗi EPROTO ở apex/www, HTTP trả 403; không có mobile DNS.','Publisher cần sửa TLS handshake/đường truy cập HTTP.'),
 'edition.cnn.com': ('publisher_access','Homepage qua hai hostname trả 403. RSS HTTP đã kiểm tra chỉ có item cũ năm 2023, thiếu pubDate.','Cần đường đọc publisher hợp lệ cho bài và feed hiện hành; không nhập feed cũ làm tin mới.'),
 'emagazine24.net': ('publisher_access','Hai hostname và feed trả 403; REST query không có phản hồi trong 5 giây.','Publisher cần cho phép đường đọc công khai hoặc cung cấp feed đầy đủ.'),
 'finance.biggo.com': ('publisher_access','Bài qua proxy trả 403. Hai API GET danh sách chính chủ hoạt động dưới news-flow, nhưng body chỉ là trích đoạn 300 ký tự hoặc trống. API đọc bài đầy đủ trả 403.','Cần quyền/endpoint bài đầy đủ hợp lệ. Đã sửa kết luận cũ về ECONNREFUSED đo dưới root; không dùng excerpt làm toàn văn.'),
 'hanoitimes.vn': ('publisher_access','Apex và RSS index trả 401; www và mobile reset.','Cần publisher khôi phục truy cập; chưa đủ bằng chứng để gỡ quarantine.'),
 'saoexpress.vn': ('publisher_access','Hai hostname, feed và REST query đều 403.','Publisher cần khôi phục/cho phép truy cập công khai.'),
 'molistar.com': ('publisher_5xx','Apex/www, feed và REST query đều HTTP 520.','Publisher cần sửa lỗi origin/upstream.'),
 'laodongdongnai.vn': ('publisher_5xx','Homepage hiện 200, có 36 link; hai bài, feed và REST query đều 500.','Publisher cần sửa backend bài/API; homepage 200 chưa đủ để bật lại nguồn.'),
 'ngoisaovietnam.vn': ('publisher_missing_content','Homepage chỉ dẫn các bài cũ, hai bài mới thử đều 404; các lượt trước cũng xác nhận bài 404.','Publisher cần khôi phục bài/URL; chưa có chuyển miền chính chủ được xác minh.'),
 'tieudungthoinay.vn': ('publisher_missing_content','Apex trả 404, www reset; chưa có chuyển miền chính chủ.','Publisher cần khôi phục nguồn hoặc cung cấp địa chỉ thay thế chính chủ.'),
 'nguoinoitieng.vn': ('publisher_missing_content','HTTP 200 nhưng là trang cPanel suspended, không có link bài.','Chủ website cần mở lại hosting; không coi trang suspended là seed hợp lệ.'),
 'thoibaobatdongsan.net': ('publisher_missing_content','Trang chính chủ thông báo đã đóng, không có link bài hiện hành.','Cần publisher mở lại website hoặc cung cấp nguồn thay thế chính chủ.'),
 'tamnhin.kienthuc.net.vn': ('publisher_transport','Apex/www reset; mobile và RSS chính chủ trong lượt trước cũng reset.','Publisher cần khôi phục origin/đường truyền.'),
 'truyenhinh.baobinhduong.vn': ('publisher_transport','Seed và bài timeout. Đã lấy đúng hai URL API video từ HTML/Nuxt gốc đã lưu; cả hai API cũng timeout qua tài khoản dịch vụ.','Publisher cần khôi phục website/API; giữ nguyên chính sách ngày gốc đã được người dùng cho phép.'),
 'vietnamfdi.vn': ('publisher_transport','Apex/www, hai bài và RSS đều timeout. Các mẫu đã lưu có clock MDY AM/PM nhưng không nêu múi giờ.','Cần publisher khôi phục HTTP và cung cấp bằng chứng múi giờ đăng; selector đã được thu hẹp ở lượt trước.'),
 'vinh24h.vn': ('publisher_transport','Apex/www và RSS đều timeout trong giới hạn 5 giây.','Publisher cần khôi phục truy cập/đáp ứng trong giới hạn runtime.'),
 'danhgiaxe.com': ('publication_or_integrity','Bài mới vẫn không có ngày đăng gốc; selector .date trỏ thời gian bài liên quan, bài thường chỉ nêu ngày chỉnh sửa. Sitemap không có publication_date.','Cần timestamp gốc có timezone hoặc feed/API gốc; không mượn đồng hồ thẻ liên quan.'),
 'dulichgiaitri.com': ('publication_or_integrity','Bài chỉ có ngày trong thẻ updated, thiếu giờ và múi giờ. Sitemap không có publication_date.','Cần publisher cung cấp ngày/giờ gốc; không suy đoán giờ từ ID/ảnh hoặc dùng ngày cập nhật.'),
 'giacavattu.com.vn': ('publication_or_integrity','Tôn trọng crawl-delay 2129 giây; replay HTML gốc đã lưu không có publication metadata/clock gốc, chỉ có ngày Cập nhật.','Cần ngày đăng gốc/feed hợp lệ. Không quét dồn để vượt crawl delay; nguồn này dùng bằng chứng đã lưu, không có probe HTTP mới trong lượt này.'),
 'gialaitv.vn': ('publication_or_integrity','HTML có tiêu đề/video nhưng chỉ hiển thị Cập nhật. Feed trả 403, WordPress REST query 503.','Cần API/feed ngày đăng gốc hoạt động; không đổi nhãn cập nhật thành ngày xuất bản.'),
 'nhansac.vn': ('publication_or_integrity','Đã kiểm tra toàn bộ 8 post công khai: 7 tiêu đề khác nhau dùng chung body 390 ký tự về hạt lanh. Cả 7 bị guard nội dung lặp chặn khi replay; còn 1 bài ngắn không đủ bộ holdout độc lập.','Publisher cần sửa nội dung sai. Nhánh AI đã bổ sung cùng guard hash với production và chỉ được requeue URL đã kiểm chứng.'),
 'tintuctoday.net': ('publication_or_integrity','HTML có body nhưng không có giờ đăng gốc. API frontend đã kiểm tra trả 500; API một bài trả 404; /rss.html là HTML, không có feed publication.','Publisher cần xuất ngày/giờ gốc hoặc sửa API; không lấy ngày từ đường dẫn ảnh/sự kiện trong bài.'),
 'travelguide.org.vn': ('publication_or_integrity','HTML bài có nội dung nhưng không có đồng hồ xuất bản/metadata gốc; RSS 404, không thấy đường bản in/API ngày gốc được khai báo.','Publisher cần cung cấp timestamp/feed gốc; không dùng thời gian sự kiện làm ngày đăng.'),
}
rows=[]
for site in base['cohort']:
    s=next(s for s in base['sites'] if s['site']==site)
    category,reason,action=notes[site]
    current=next(s for s in post['sites'] if s['site']==site)
    probes=[{k:p.get(k) for k in ['url','error','statusCode','file','checkedAt']} for p in [*s['seeds'],*s['articles']]]
    probes += [{k:p.get(k) for k in ['url','error','statusCode','file']} for p in [*native['checks'],*extra['checks']] if p['site']==site]
    rows.append({'site':site,'disposition':'blocked_external_or_missing_native_evidence','category':category,'reason':reason,'requiredAction':action,'alerts':current['alerts'],'evidence':probes,'deferred':s.get('deferred'),'earlierEvidence':prior[site].get('earlierHttpEvidence',[])})
assert len(rows)==27 and set(notes)==set(base['cohort']) and post['verified']
counts=dict(Counter(r['category'] for r in rows))
out={'at':post['at'],'scope':'Complete one-pass audit of all 27 remaining sources','reviewed':27,'restored':0,'remaining':post['remaining'],'paidAiApiCalls':0,'paidAiApiUsd':0,'categories':counts,'sites':rows}
(root/'source-disposition.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
local_time=(datetime.fromisoformat(post['at'].replace('Z','+00:00'))+timedelta(hours=7)).strftime('%d/%m/%Y %H:%M UTC+7')
lines=[f'QC TOÀN BỘ 27 NGUỒN NEWS — {local_time}', '', 'Đã rà đủ 27 nguồn trong một lượt; 26 nguồn có probe HTTP mới, Giacavattu replay chứng cứ gốc theo crawl-delay. Không có nguồn nào vượt đủ điều kiện để bật lại an toàn; cả 27 cảnh báo vẫn được giữ đúng trạng thái.', '', 'LỖI HỆ THỐNG ĐÃ SỬA VÀ TRIỂN KHAI', '1. AI parser overlay chỉ mở lại đúng URL fail đã được kiểm chứng bằng HTML đầy đủ, khớp lỗi cũ và snapshot. Trước đây một patch kiểm chứng vài bài có thể requeue toàn bộ bài fail của nguồn. Lỗi mới, URL chưa kiểm chứng và bài đã hoàn tất được giữ nguyên; xóa failure theo đúng request alias đã xác minh.', '2. Bước kiểm chứng bản vá AI áp dụng sharedContentHashes như production. Nội dung đã xác nhận lặp không được dùng để chấp nhận parser và mở lại hàng đợi.', '3. Bỏ qua AI article review đối với nguồn đang quarantine. Seed review không gọi model khi chỉ có lỗi DNS/TLS/4xx/5xx/timeout và không có HTML thành công; trạng thái fail và bằng chứng được giữ.', '', 'XÁC MINH', '- VPS: 87/87 kiểm tra đạt, không gọi API thật trong test. Local: 6 kiểm tra mới + 13 kiểm tra AI/overlay đạt; bộ kiểm tra eligibility/budget liên quan cũng đạt trước đó.', '- Bốn file triển khai khớp SHA-256. Giữ nguyên các thay đổi live khác về selector/evidence, seed transient handling và scheduling; chỉ áp dụng hunk của lượt này.', '- Seed/parse/import active, NRestarts=0; importer giữ PID 1161405. Không sửa trạng thái nguồn để che cảnh báo, không requeue hàng loạt trong đợt deploy, không ghi/xóa dữ liệu ES thủ công.', '- ai_usage giữ nguyên; AI_DAILY_BUDGET_USD=2 và giới hạn call hiện hành không đổi. Tổng ngân sách người dùng cho đợt QC là 15 USD; lượt này chi thêm 0 USD API, không dùng Astra.', '- Nhansac: 7/8 post có nội dung lặp/sai; replay xác nhận cả 7 bị chặn. BigGo: API danh sách trả 200 dưới đúng user dịch vụ, nhưng chỉ cung cấp trích đoạn 300 ký tự; API đọc bài đầy đủ trả 403. Phép đo ECONNREFUSED dưới root trong báo cáo trước không đại diện cho runtime và được thay bằng bằng chứng này.', '', 'KẾT LUẬN TỪNG NGUỒN']
for n,r in enumerate(rows,1):lines += [f"{n:02}. {r['site']} [{r['category']}]", '    '+r['reason'], '    Cần: '+r['requiredAction']]
lines+=['','BẰNG CHỨNG VÀ KHÔI PHỤC','- source-disposition.json: đủ 27 nguồn, từng URL đã thử và đường dẫn evidence.', '- all-probe.json, native-routes.json, declared-extra.json: probe theo nhóm và template gốc.', '- nhansac-all-posts.json, biggo-public-api.json, biggo-detail-controls.json, giacavattu-offline.json: kiểm chứng chuyên biệt.', '- postcheck.json, safety-tests-vps.txt, verified-patches.json: kiểm tra live và patch có baseline/hash.', '- VPS backup: /var/lib/news-flow/qc-remaining27-all-20261122/safety-apply-before.json.', '- Không thêm fireant.vn hoặc bất kỳ subdomain nào.']
(root/'QC-REPORT.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'reviewed':27,'restored':0,'remaining':post['remaining'],'categories':counts},ensure_ascii=False))
