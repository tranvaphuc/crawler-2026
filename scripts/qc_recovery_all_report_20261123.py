import collections,csv,datetime,hashlib,json,re
from pathlib import Path

root=Path('outputs/recovery-all-2026-11-23')
def load(name):return json.loads((root/name).read_text(encoding='utf-8-sig'))
news=load('QC-NEWS-RESULT.json');forum=load('QC-FORUM-RESULT.json');baseline=load('news-baseline.json')
latest=collections.Counter()
with (root/'news-url-results.csv').open(encoding='utf-8-sig',newline='') as stream:
 for row in csv.DictReader(stream):
  if row['decision']!='still_requires_review':continue
  reason=row['fresh_reason'] or row['repair_reason'] or row['initial_qc_reason'] or row['current_error'] or 'unclassified'
  if row['stage_status']=='legacy_time_conflict':reason='NEWS_EXISTING_ORIGINAL_TIME_CONFLICT'
  latest[reason]+=1
assert sum(latest.values())==104597
bootstrap=[json.loads(line) for line in (root/'bootstrap-log.txt').read_text(encoding='utf-8-sig').splitlines() if line.startswith('{')]
bootstrap_by_site={s['site']:s for s in bootstrap if s.get('site')}
today=news['aiUsage'][-1];before=[s for s in baseline['aiUsage'] if s['day']==today['day']][0]
ai_delta={'calls':today['calls']-before['calls'],'usd':today['usd']-before['usd']}
tz=datetime.timezone(datetime.timedelta(hours=7))
def local_time(ms):return datetime.datetime.fromtimestamp(ms/1000,tz).strftime('%d/%m/%Y %H:%M:%S +07')
def disposition(source):
 reasons={a.get('reason','') for a in source['nativeRoutes']['articles']};b=bootstrap_by_site.get(source['site']);checks=source['nativeRoutes']['checks']+source['officialHttpRoutes']['checks'];errors={x.get('error') for x in checks}
 if b: return 'Đã thử dựng parser từ ba bài native: đều thiếu publishedDate gốc. Cần feed/API/HTML công bố thời điểm xuất bản gốc gắn đúng bài; không lấy ngày trong tiêu đề hay mặc định 00:00.'
 if source['site']=='vir.com.vn':return 'Đã dùng đường HTTP chính thức được publisher phục vụ, kiểm chứng năm bài độc lập; seed thực tế tìm 92 link. Giữ kiểm tra TLS chung cho các nguồn khác.'
 if source['site'] in ['msn.com','nghetinhplus.vn','qdnd.vn']:return 'Đã khôi phục seed và chạy bài kiểm chứng trên production. Các URL còn mâu thuẫn clock/identity vẫn giữ review riêng.'
 if 'publication_quarantine' in source['remainingComparableAlerts']:return 'Giữ cách ly xuất bản: cần bằng chứng thời gian gốc và quyền đọc gắn đúng bài trước khi mở lại; các đường feed/API/HTTP đã thử chưa đủ điều kiện.'
 if any('PUBLICATION' in s or 'published_date' in s or 'publication_' in s for s in reasons):return 'Đã đọc được HTML nhưng bằng chứng xuất bản chưa gắn chắc với đúng bài, thiếu giờ gốc hoặc selector chỉ sang bài khác. Cần native Article/clock tự khớp URL và kiểm chứng nhiều bài độc lập trước khi áp dụng.'
 if 'not_found' in reasons:return 'Seed có link nhưng các bài kiểm chứng trả 404. Cần publisher sửa URL bài hoặc API chi tiết trả đúng native ID; không đổi sang nội dung của trang khác.'
 if 'http_500' in reasons:return 'Seed đọc được nhưng endpoint bài trả 500. Các đường thay thế trong bảng route chưa có đủ native bài; chỉ mở lại sau khi bài/API hoạt động và qua quality gate.'
 if errors.intersection({'access_blocked','rate_limited'}):return 'Đã thử route/feed/API khai báo và đường HTTP chính thức. Cần endpoint công khai/được phép hoạt động; giữ review khi 401/403/429 hoặc chưa có toàn văn và clock gốc.'
 if 'CERT_HAS_EXPIRED' in errors:return 'HTTPS lỗi chứng chỉ; đã thử thêm HTTP chính thức và feed/API nhưng chưa có route đủ chuẩn như VIR. Cần publisher sửa TLS hoặc có endpoint hợp lệ; không tắt xác minh TLS.'
 if source['nativeRoutes']['checks'] and all(not c.get('articleLinks') for c in source['nativeRoutes']['checks']):return 'Root/feed/API/đường đọc khác đã được thử nhưng chưa có đủ bài native để khôi phục. Cần route đang hoạt động, trả link bài thật, toàn văn và giờ xuất bản gốc; không coi HTTP 200 của trang rỗng là thành công.'
 return 'Giữ các URL chưa vượt đủ kiểm tra toàn văn, đúng bài và giờ gốc. Bảng route ghi endpoint đã thử; chỉ phục hồi khi có ít nhất các bài native độc lập qua cùng cổng production.'

lines=[
 'QC NEWS VÀ FORUM — 23/11/2026',
 'Snapshot news: '+local_time(news['at'])+'; forum: '+local_time(forum['at']),
 '',
 'Đã hoàn tất lượt QC cố định trên toàn bộ 109.723 URL news và đối chiếu toàn bộ 5.261 URL forum. Số thực tế lớn hơn yêu cầu ban đầu do queue tiếp tục phát sinh trước lúc chốt cohort. Không còn URL news chưa có verdict kiểm tra; không còn ứng viên verified/excluded bị bỏ sót ở bước stage.',
 '',
 'NEWS',
 '- 5.002 URL hiện ở trạng thái done; 124 URL xác nhận không phải bài báo; 104.597 URL còn fail/review. Đây là kết quả thực tế, không phải 109.723 URL đều đã được khôi phục.',
 '- 4.366 kết quả nhập mới được đọc lại từ ES và khớp đủ url/title/content/description/publishedDate. 99 kết quả cũ khớp đủ trường; 525 kết quả cũ giữ nguyên theo cơ chế create-only dù nội dung/mô tả hiện tại khác. Không ghi đè tài liệu lịch sử.',
 '- 19 URL có thời điểm gốc khác tài liệu ES lịch sử được giữ review NEWS_EXISTING_ORIGINAL_TIME_CONFLICT. Đã bảo toàn ES và lưu bằng chứng đối chiếu từng trường hợp.',
 '- 4.990 URL đã stage có kiểm chứng cách ly lịch sử: 0 lần vượt cờ quarantine. Ngoài cohort stage có 12 URL được luồng production giải quyết bình thường.',
 '- Sửa 17 biến thể selector trên 16 nguồn, kèm ba mẫu training và hai holdout HTTP độc lập, kiểm tra không đổi các mẫu tốt cũ. Sửa binding headline QĐND; sửa xử lý HTTP redirect cùng native ID; thêm bảo vệ requested URL đang bị cách ly lịch sử.',
 '- Khôi phục seed thực tế MSN, Nghệ Tĩnh Plus, QĐND và VIR; xử lý thêm Tuyengiao (40 link) và VOH (69 link) khi phát sinh cảnh báo trong lượt chạy. Cả hai có bài kiểm chứng parse done.',
 '- Sửa guard timeout ES của nhánh Baomoi-original để lỗi đọc tạm thời không làm service chết và không tiến marker kiểm tra khi chưa đọc được.',
 '- Cho riêng seed dulich.thethaovanhoa.vn HTTP503 được thử lại ở vòng seed bình thường kế tiếp bằng policy hiện có. Đã xác nhận chuyển fail sang timeout; endpoint vẫn đang 503, chưa coi nguồn này đã khôi phục. Không mở lại lỗi 403/404 hay bài viết.',
 '',
 'CẢNH BÁO NGUỒN',
 f"- Trong 33 nguồn ban đầu: {len(news['clearedInitialSites'])} nguồn hết nhóm cảnh báo cũ, {len(news['remainingInitialSites'])} nguồn vẫn còn. Hết cảnh báo tổng hợp không bảo đảm mọi bài hiện tại đều parse thành công.",
 '- Hết cảnh báo cũ: '+', '.join(news['clearedInitialSites'])+'.',
 '- Health hiện có thêm chỉ số chuyên mục/backfill so với baseline: '+str(news['expandedHealth']['alertSites'])+' nguồn có ít nhất một loại cảnh báo theo định nghĩa mở rộng. Không thể so trực tiếp con số này với 33 nguồn ban đầu.',
 '- Cảnh báo vận hành ngoài 33 nguồn tại snapshot: '+json.dumps(news['additionalOperationalSites'],ensure_ascii=False)+'. Đây là trạng thái vòng production đang chạy, được ghi riêng để không bỏ qua biến động mới.',
 '',
 'FORUM',
 '- Đã sửa việc chọn queue khiến lượt đọc đầu, checkpoint chưa xong và poll cũ có thể tranh chỗ không công bằng. Lịch mới luân phiên ba nhóm, giữ FIFO trong từng nhóm và giữ nguyên checkpoint.',
 '- Site có backlog đọc đầu được xử lý mỗi vòng; batch catchup 12 topic/site, batch bình thường 4, tối đa 10 trang/topic. Không xóa queue hay đánh dấu hoàn thành giả.',
 '- Trong cohort 5.261: '+json.dumps(forum['counts'],ensure_ascii=False)+'.',
 '- Còn 2.214 URL trong cohort chưa được chạy lần đầu, đều ở VOZ; tổng backlog đọc đầu VOZ hiện 2.298 gồm cả URL phát sinh mới. Backlog đang giảm (cohort ban đầu 2.431). Không khẳng định toàn bộ 5.261 URL đã crawl xong.',
 '- 1.519 URL đã từng hoàn thành và đang chờ poll lại; 25 URL còn giữ nguyên lý do lỗi. 1.213 URL hoàn thành thêm, 290 URL đã thay đổi checkpoint/trạng thái.',
 '- Collector và writer đều active, không tự restart. Tại snapshot writer không còn pending hoặc held; created='+str(next(x['n'] for x in forum['documents'] if x['export_state']=='created'))+'.',
 '',
 'KIỂM CHỨNG VÀ CHI PHÍ',
 '- Kiểm thử local: 85/85. Trên đúng bản production: news 47/47, forum 30/30. Các bộ test hiện có trên hai máy khác nhau; không gọi API AI trong test.',
 '- News seed/parse/import/Baomoi-original và forum collector/writer đều active; không có automatic restart tại snapshot. Importer news PID 1161405 giữ nguyên từ 19/11.',
 '- Không gọi AI API thủ công cho lượt QC; không dùng Astra. Ledger tự động hôm nay: '+str(today['calls'])+' calls, USD '+format(today['usd'],'.8f')+'. Tăng trong khoảng snapshot QC: '+str(ai_delta['calls'])+' calls, USD '+format(ai_delta['usd'],'.8f')+'.',
 '- Cấu hình tiếp tục USD 2/ngày UTC, tối đa 200 calls, model gpt-5.4-mini, chung ledger ai_usage. Giữ nguyên toàn bộ usage lịch sử (kể cả dòng cũ vượt hạn mức); không reset hoặc lập ledger phụ. Trần này không đo phí hội thoại ứng dụng Codex/ChatGPT.',
 '- Không bổ sung fireant.vn hoặc tên miền con.',
 '',
 'NHÓM NGUYÊN NHÂN TỪ VERDICT NATIVE MỚI NHẤT CỦA CÁC URL CÒN GIỮ REVIEW',
 *['- '+reason+': '+str(count) for reason,count in latest.most_common(20)],
 '',
 'ĐỐI SOÁT TỪNG NGUỒN TRONG 33 NGUỒN BAN ĐẦU',
 ]
source_rows=[]
for i,s in enumerate(news['sources'],1):
 routes=s['nativeRoutes']['checks']+s['officialHttpRoutes']['checks'];native=s['nativeRoutes']['checks'];controls=s['nativeRoutes']['articles'];action=disposition(s)
 lines.extend(['',str(i)+'. '+s['site'],'Cảnh báo cũ còn: '+(', '.join(s['remainingComparableAlerts']) or 'không')+'; URL cohort: '+json.dumps(s['cohort'],ensure_ascii=False), 'Kết quả bài kiểm chứng ban đầu: '+(', '.join(a.get('reason') or a.get('outcome','') for a in controls) or 'chưa có bài native đủ để chạy'), 'Xử lý/chốt: '+action,'Các route đã thử:'])
 for c in routes:lines.append('  '+c.get('kind','route')+' '+c.get('url','')+' -> '+str(c.get('statusCode') or '')+' '+str(c.get('error') or 'OK')+'; articleLinks='+str(c.get('articleLinks',''))+'; feedItems='+str(c.get('feedItems','')))
 source_rows.append({'site':s['site'],'remaining_old_alerts':','.join(s['remainingComparableAlerts']),'cohort':json.dumps(s['cohort'],ensure_ascii=False),'action_or_reopen_condition':action,'native_routes':json.dumps(routes,ensure_ascii=False),'sample_outcomes':json.dumps(controls,ensure_ascii=False)})
lines.extend(['','TỆP KIỂM TOÁN','news-url-results.csv: đủ 109.723 dòng, gồm lỗi cũ, verdict đầu, verdict repair/fresh HTTP, trạng thái live cuối, ES readback và đường dẫn/hash bằng chứng. Lỗi hiện có trong live ledger được giữ cùng verdict native mới để có thể kiểm tra khác biệt; không giả vờ xóa sạch lỗi.','forum-url-results.csv: đủ 5.261 dòng, gồm trạng thái trước/sau, next_at và checkpoint.','news-sources-33.csv: đủ 33 nguồn với route native/feed/API/HTTP đã thử và điều kiện phục hồi.','QC-NEWS-RESULT.json, QC-FORUM-RESULT.json: snapshot máy đọc được. download-manifest.json: SHA256 bản xuất từ VPS. Toàn bộ hash và số dòng CSV đã được kiểm chứng.','HTML/API evidence giữ trên VPS trong /var/lib/news-flow/recovery-all-20261123/evidence, audit.sqlite giữ verdict theo từng URL. Các bản sao trước sửa được giữ tại cùng thư mục.'])
(root/'QC-REPORT.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')
with (root/'news-sources-33.csv').open('w',encoding='utf-8-sig',newline='') as stream:
 writer=csv.DictWriter(stream,fieldnames=source_rows[0].keys());writer.writeheader();writer.writerows(source_rows)
combined={'news':news,'forum':forum,'latestHeldReasons':dict(latest),'bootstrapParserAttempts':bootstrap,'aiDeltaDuringSnapshot':ai_delta,'artifactsVerified':True,'report':'QC-REPORT.txt'}
(root/'QC-REPORT.json').write_text(json.dumps(combined,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'report':str((root/'QC-REPORT.txt').resolve()),'newsRows':109723,'forumRows':5261,'sourceRows':len(source_rows),'latestHeldReasons':latest.most_common(6),'aiDelta':ai_delta},ensure_ascii=False))
