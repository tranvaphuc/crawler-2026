import json
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
root=Path('outputs/news-remaining29-2026-11-22')
read=lambda name:json.loads((root/name).read_text(encoding='utf-8'))
post,probe=read('postcheck.json'),read('probe.json')
old=json.loads(Path('outputs/news-remaining36-2026-11-22/source-disposition.json').read_text(encoding='utf-8'))
notes={s['site']:s['notes'] for s in old['sites']}
notes.update({
 '2saigon.vn':'DNS hệ thống và Google Public DNS cùng xác nhận NXDOMAIN (Status=3). Không có DNS A để kết nối; cần publisher khôi phục DNS.',
 'dailo.vn':'Leaf certificate của dailo.vn hết hạn 18/11/2026 23:59:59 GMT. Lỗi không nằm ở intermediate CA của crawler; cần publisher gia hạn chứng thư.',
 'kinhteplus.com.vn':'Leaf wildcard certificate *.kinhteplus.com.vn hết hạn 14/11/2026 23:59:59 GMT. Cần publisher gia hạn chứng thư.',
 'tieudungso.vn':'Server trả TLS alert internal error (80) trong OpenSSL và EPROTO trong proxy driver.',
 'gialaitv.vn':'HTML chỉ ghi Cập nhật. Feed thường và ?feed=rss2 trả 403; public WordPress post API trả 503. Chưa có original publication clock đạt chuẩn.',
 'laodongdongnai.vn':'Homepage, category, RSS và public WordPress API đều trả 500. Cần website xử lý lỗi backend.',
 'molistar.com':'Homepage, RSS và endpoint post WordPress được HTML cũ công bố đều trả 520. Cần website/origin hoạt động trở lại.',
 'tintuctoday.net':'HTML không có original clock. Đã đọc static bundle (không chạy JS): client dùng post_publish_at từ /api/posts/homepage, nhưng API đó trả 500; /api/posts/82522 trả 404. AJAX news listing trả HTML không có clock gốc.',
 'vietnamfdi.vn':'Đã sửa title/date/body selectors để chỉ lấy article.article-post. Sáu mẫu có đúng 1 node cho mỗi field; toàn bộ vẫn bị giữ bởi NEWS_PUBLICATION_TIMEZONE_UNCONFIRMED. Giữ enabled=false và chưa mở ghi vì clock MDY của publisher không nêu múi giờ.',
 'nhansac.vn':'Đã chặn source-specific body hash lặp dưới 4 tiêu đề khác nhau qua processor và audit gate. Replay 4/4 mẫu bị chặn; mẫu có body khác giữ hành vi cũ. Publisher phải cung cấp body đúng từng bài; source chưa được bật lại.',
 'vntravel.org.vn':'Đã bổ sung hai chuyên mục được publisher liên kết và RSS chính thức; 4/4 seed live status=ok. Thêm variant dùng pubDate gốc RSS khi JSON-LD thiếu, 3 URL lỗi được xác minh riêng và 6 control không đổi. Tổng lượt này tạo 4 bài ES và đọc lại 4/4 khớp. Loại đúng một profile tác giả khỏi queue; còn các bài cũ ngoài phạm vi feed chưa đủ publication proof.'
})
groups={
 'dns':['2saigon.vn'],
 'tls_or_handshake':['dailo.vn','kinhteplus.com.vn','tieudungso.vn'],
 'access_or_rate_limit':['coindesk.com','edition.cnn.com','emagazine24.net','finance.biggo.com','hanoitimes.vn','saoexpress.vn'],
 'upstream_5xx':['laodongdongnai.vn','molistar.com'],
 'article_or_site_404':['ngoisaovietnam.vn','tieudungthoinay.vn'],
 'transport_or_mixed_publication':['tamnhin.kienthuc.net.vn','tieudungplus.vn','truyenhinh.baobinhduong.vn','vietnamfdi.vn','vinh24h.vn'],
 'publication_or_content_evidence':['danhgiaxe.com','dulichgiaitri.com','giacavattu.com.vn','gialaitv.vn','nhansac.vn','tintuctoday.net','travelguide.org.vn'],
 'no_current_news_content':['nguoinoitieng.vn','thoibaobatdongsan.net']
}
category={site:group for group,sites in groups.items() for site in sites}
rows=[]
for s in post['sites']:
    current=next(p for p in probe['sites'] if p['site']==s['site'])
    rows.append({**s,'category':category.get(s['site'],'recovered_flow'),
      'currentHttp':[{k:p.get(k) for k in ['url','error','statusCode','links']} for p in current.get('seeds',[])],
      'deferred':current.get('deferred'),'notes':notes[s['site']]})
assert len(rows)==29 and post['cohortAlerting']==28
assert post['verified'] and post['aiLedgerUnchanged']
assert len(post['esReadback'])==4 and all(r['verified'] for r in post['esReadback'])
assert sum(bool(a.get('receipt',{}).get('status')=='created') for a in post['articles'])==4
assert all(p['status']=='ok' for p in post['seeds'])
out={'checkedAt':post['at'],'cohortSize':29,'alerting':28,'createdAndReadBack':4,
     'paidAiApiCalls':0,'paidAiApiUsd':0,'remainingCategories':{k:len(v) for k,v in groups.items()},'sites':rows}
(root/'source-disposition.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
stamp=(datetime.fromisoformat(post['at'].replace('Z','+00:00'))+timedelta(hours=7)).strftime('%d/%m/%Y %H:%M:%S UTC+7')
text=f'''QC tiếp cohort 29 nguồn news — {stamp}

Đã triển khai và xác minh:
1. VNTravel: thêm 2 chuyên mục chính thức và RSS publisher (33 bài tại lúc kiểm tra), giúp source có 4 seed thay vì phụ thuộc homepage. Cả 4 seed đã chạy vòng production và trả links_found.
2. VNTravel: thêm parser variant lấy original pubDate của RSS khi bài thiếu JSON-LD. Ba URL lỗi qua strict gate độc lập; 6 bài control giữ nguyên title/body/description/url/publishedDate. Các trường hợp có dữ liệu xung đột hoặc không có trong feed vẫn bị giữ theo gate hiện có.
3. Bốn URL phục hồi trong lượt này đã có receipt created; đọc lại ES đúng cluster và cả 4/4 khớp native title/content/description/url/publication. Không còn outbox held của 4 URL này.
4. Sửa nhận diện /user/<name> riêng cho VNTravel: trang cá nhân không admission bài hoặc gọi HTTP/parser. Một record hồ sơ tác giả đã được chuyển từ fail sang skipped/non_article đúng chứng cứ HTML.
5. Nhansac: bổ sung guard ở processor và audit gate cho một content hash đã chứng minh lặp dưới 4 tiêu đề. Replay native API: 4/4 bản lỗi bị chặn; body khác không bị chặn chỉ vì cùng publisher. Source vẫn chưa bật lại do dữ liệu publisher chưa đạt.
6. VietnamFDI: thu hẹp 3 selector title/date/body vào article chính, loại lỗi lấy clock/body của bài liên quan. Sáu mẫu đều có đúng 1 node/field. Cả 6 vẫn dừng ở NEWS_PUBLICATION_TIMEZONE_UNCONFIRMED, giữ enabled=false và chưa ghi ES.

Kết quả giới hạn rõ ràng:
- Rà đúng cohort 29: 28 nguồn còn cảnh báo, VNTravel không còn cảnh báo discovery ở snapshot cuối. Đầu lượt live đã dao động còn 28 do homepage timeout phục hồi tạm thời; không dùng biến động bộ đếm làm bằng chứng sửa được source.
- Các sửa thực tế được chứng minh bằng seed chạy lại, parser controls, replay guard và readback ES, không chỉ bằng status HTTP 200.
- Các lỗi còn lại chia theo nguyên nhân chính: DNS 1, TLS/handshake 3, access/rate-limit 6, upstream 5xx 2, site/article 404 2, timeout/reset hoặc mixed publication 5, publication/content 7, không có news hiện tại 2. Tổng 28.
- Nhóm DNS/TLS/upstream HTTP cần publisher khôi phục dịch vụ. Nhóm publication/content cần original clock/body đáng tin từ publisher. AI không thể tạo dữ liệu gốc thay cho bằng chứng còn thiếu.
- Giacavattu được đối chiếu bằng chứng lưu và giữ lịch publisher; không gửi burst request để bỏ qua crawl-delay.

Kiểm tra vận hành và ngân sách:
- 43 regression tests local pass, 0 fail. Các nhóm guard/classification tests đã chạy thành công trên VPS; 6 replay selector VietnamFDI và 6 control RSS cũng đạt điều kiện kỳ vọng.
- Seed/parse/import active, NRestarts=0. Import PID 1161405 giữ nguyên. Hash 6 file triển khai khớp; đồng bộ local chỉ các key/hunk thuộc lượt sửa này.
- ai_usage đầu/cuối không đổi. Paid AI API do lượt QC này gọi: 0; phát sinh 0 USD trong tổng 15 USD đã cấp. Không dùng Astra.
- Cấu hình giữ AI_DAILY_BUDGET_USD=2, AI_DAILY_MAX_CALLS=200, NEWS_AI_MODEL=gpt-5.4-mini. Ledger chính được giữ nguyên; không thêm FireAnt.
- Backup chọn lọc code/config/state nằm trong /var/lib/news-flow/qc-remaining29-20261122: apply-before.json, feed-apply-before.json, profile-before.json, vfi-scope-before.json.

Từng nguồn còn lại và điều kiện phục hồi:
'''
for s in rows:
    text+=f"\n{s['site']} | {s['category']} | {', '.join(s['alerts']) or 'không có cảnh báo discovery'}\n{s['notes']}\n"
text+='\nChứng cứ: postcheck.json, source-disposition.json, probe.json (DNS/certificates/HTTP), recoverable.json, vn-feed.json, feed-apply-result.json, profile-apply.json, vfi-scope.json, public-api.json, tintuc-api.json, tests-final.txt. HTML/JSON gốc gzip và test output VPS lưu cùng thư mục QC trên VPS.\n'
(root/'QC-REPORT.txt').write_text(text,encoding='utf-8')
print(json.dumps({'report':str(root/'QC-REPORT.txt'),'cohort':29,'remainingAlerts':28,'createdAndReadBack':4,'badBodiesBlocked':4,'profileExcluded':1,'vfiScopedSamples':6,'paidAiApiUsd':0},ensure_ascii=False))
