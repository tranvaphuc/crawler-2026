"""Close every source in the requested cohort with evidence and a reopening condition."""
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path('outputs/news-closeout25-2026-11-22')
batch = json.loads((ROOT / 'batch.json').read_text(encoding='utf-8'))
supp = json.loads((ROOT / 'supplement.json').read_text(encoding='utf-8'))
prior = json.loads((ROOT / 'prior-cases.json').read_text(encoding='utf-8'))
payload = json.loads((ROOT / 'payload-inspection.json').read_text(encoding='utf-8'))
# site, group, native cause, concrete next action, measurable reopening condition
rows = [
 ('2saigon.vn','network','A và AAAA của apex/www đều ENOTFOUND; HTTP qua proxy reset.','Chủ website khôi phục DNS.','DNS hợp lệ, seed và bài truy cập được qua transport production.'),
 ('coindesk.com','network','Trang chủ/bài trả 429 Security Checkpoint. RSS gốc hiện có 25 item với pubDate nhưng toàn bộ content:encoded rỗng, description 37–184 ký tự.','Cần đường đọc toàn văn/feed đầy đủ hoặc quyền truy cập do publisher hỗ trợ.','Ít nhất 5 bài gốc gồm 2 holdout có toàn văn, timestamp và identity vượt gate qua proxy production.'),
 ('dailo.vn','network','Chứng chỉ leaf CN=dailo.vn hết hạn 18/11/2026 23:59:59 UTC; strict TLS vẫn báo CERT_HAS_EXPIRED.','Chủ website gia hạn và cài đúng chuỗi TLS.','Apex/www và các bài vượt kiểm tra chứng chỉ, sau đó kiểm lại parser/holdout.'),
 ('danhgiaxe.com','native_data','Selector .date trỏ đồng hồ bài liên quan; bài riêng không có ngày đăng gốc. Bài thường chỉ nêu ngày chỉnh sửa.','Publisher cung cấp timestamp đăng gốc có múi giờ trong HTML/feed/API của đúng bài.','Có bằng chứng original date của bài; sửa selector theo bằng chứng và vượt holdout.'),
 ('dulichgiaitri.com','native_data','Thẻ time có class updated chỉ mang ngày, thiếu giờ/múi giờ và chưa chứng minh là ngày đăng đầu.','Cần metadata/feed/API ngày đăng gốc; chỉ đổi chuẩn ngày khi có quyết định rõ về dữ liệu.','Đúng bài có original publication đủ độ chính xác được cho phép; không dùng ngày cập nhật.'),
 ('edition.cnn.com','network','Trang chủ và bài 403; các đường proxy hiện có đều bị chặn. Feed thay thế đã kiểm chỉ có dữ liệu cũ, không đủ publication hợp lệ.','Cần feed/API toàn văn hiện hành hoặc quyền truy cập publisher hỗ trợ.','Đọc được bài mới đầy đủ và timestamp gốc qua transport được hỗ trợ.'),
 ('emagazine24.net','network','Trang chủ, bài và feed 403; đường REST chưa đọc được.','Publisher/đường truy cập cần bỏ chặn hoặc cung cấp feed/API công khai đầy đủ.','Seed và ít nhất 5 bài/2 holdout vượt gate qua production.'),
 ('finance.biggo.com','network','HTML qua proxy 403. API danh sách đọc được nhưng content chỉ 0/300 ký tự, summary là tóm tắt, community_content/highlight_content null; API bài chi tiết 403.','Cần quyền hoặc endpoint toàn văn được publisher hỗ trợ.','Có body đầy đủ khớp bài gốc, URL/ID và original timestamp; không ghép summary thành toàn văn.'),
 ('giacavattu.com.vn','native_data','Production đọc được homepage; mẫu bài đã lưu chỉ có “Cập nhật”, chưa có original publication. Có crawl-delay 2129 giây trong cấu hình nhưng runner hiện cố ý tắt cooldown theo thiết kế.','Giữ cách ly nhập bài; cần nguồn ngày đăng gốc và thống nhất chính sách nhịp crawl trước khi mở. Không phát thêm HTTP thủ công ở lượt này.','Có original timestamp của bài và cách vận hành đáp ứng chính sách publisher. Việc HTTP 200 không đủ mở nhập.'),
 ('gialaitv.vn','native_data','HTML bài đọc được nhưng chỉ nêu giờ cập nhật, thiếu original GMT. Feed/API WordPress đã kiểm trả 403/503, gồm single-post trên 11 proxy.','Publisher khôi phục API/feed có ngày đăng đầu hoặc bổ sung metadata original vào HTML.','Original date_gmt/datePublished được gắn đúng post ID/URL và vượt ít nhất 2 holdout.'),
 ('hanoitimes.vn','network','Trang chủ/RSS 401; hostname thay thế đã kiểm không cung cấp bài hợp lệ.','Cần publisher cấp quyền đọc hoặc feed/API công khai được hỗ trợ.','Đường chính thức trả bài mới đầy đủ; xác minh lại source và publication.'),
 ('kinhteplus.com.vn','network','Chứng chỉ leaf CN=*.kinhteplus.com.vn hết hạn 14/11/2026 23:59:59 UTC.','Chủ website gia hạn chứng chỉ TLS.','HTTPS hợp lệ, bài/seed đọc được; kiểm lại các mẫu trước khi bật.'),
 ('laodongdongnai.vn','network','Homepage 200 nhưng cả URL bài kiểm tra đều 500; feed và REST cũng đã trả 500.','Chủ website sửa backend bài/feed/API.','Bài thật trả toàn văn 200 và publication hợp lệ; homepage 200 chưa đủ.'),
 ('ngoisaovietnam.vn','closed_or_404','Homepage còn link cũ nhưng URL bài 404, xác nhận trên cả 11 proxy.','Tạm ngừng nguồn nhập; cần publisher khôi phục bài hoặc thông báo URL thay thế chính thức.','URL bài được khôi phục hoặc có chuyển miền/URL chính thức xác minh được.'),
 ('nguoinoitieng.vn','closed_or_404','Homepage và URL bài đều về Account Suspended dù HTTP 200.','Tạm ngừng nguồn nhập; chủ website/hosting cần mở lại tài khoản.','Trang bài thực sự trở lại, không còn suspended page; kiểm lại parser/holdout.'),
 ('nhansac.vn','native_data','Đọc lại toàn bộ 8 bài qua REST: 7 tiêu đề khác nhau cùng body 390 ký tự, còn 1 bài riêng 415 ký tự. Guard nội dung trùng đang giữ chặn.','Publisher sửa nội dung khớp tiêu đề; giữ quarantine và guard hash hiện tại.','Có nhiều bài độc lập với nội dung đúng, đủ mẫu/holdout và vượt body-integrity gate.'),
 ('tamnhin.kienthuc.net.vn','network','HTTPS reset; mobile và RSS chính thức đã kiểm cũng reset, HTTP 503.','Chủ website khôi phục origin/DNS/TLS hoặc đường đọc chính thức.','Homepage, danh mục, RSS/bài truy cập ổn định qua production rồi kiểm lại parser.'),
 ('thoibaobatdongsan.net','closed_or_404','HTTP 200 nhưng nội dung thông báo “Trang này không may bị đóng”, không có link bài.','Tạm ngừng nguồn nhập; cần publisher mở lại hoặc xác nhận nguồn thay thế chính thức.','Có trang tin và bài thật trở lại, không còn thông báo đóng.'),
 ('tieudungso.vn','network','Bắt tay TLS vẫn lỗi internal alert 80/EPROTO; HTTP đã kiểm 403.','Chủ website sửa cấu hình TLS trên server.','TLS strict thành công và đọc được bài/feed gốc; không tắt kiểm tra chứng chỉ.'),
 ('tieudungthoinay.vn','closed_or_404','Trang chủ và URL bài HTTPS 404; HTTP không cung cấp nội dung bài hợp lệ.','Tạm ngừng nguồn nhập; cần publisher khôi phục hoặc xác nhận địa chỉ thay thế.','Địa chỉ chính thức có bài thật, metadata gốc và vượt gate.'),
 ('tintuctoday.net','native_data','Bài có title/body nhưng không có publication gốc trong HTML; API do JS khai báo trả 500/404, RSS không phải feed.','Publisher khôi phục API có ngày đăng hoặc bổ sung timestamp gốc.','Có original timestamp gắn đúng bài; không suy từ ngày trong ảnh, URL hoặc sự kiện.'),
 ('travelguide.org.vn','native_data','Bài đọc được nhưng không có ngày đăng riêng. Ngày trong nội dung là ngày sự kiện; sidebar có heading không thuộc bài.','Publisher cung cấp ngày đăng gốc qua HTML/feed/API.','Có publication của đúng bài, tách khỏi ngày sự kiện/sidebar, và vượt holdout.'),
 ('truyenhinh.baobinhduong.vn','network','Trang/video và API chính thức khai báo trong Nuxt đều timeout; kiểm tra 11 proxy chưa có đường đạt deadline hiện hành.','Chủ website khôi phục/tối ưu origin và API video.','Đọc được danh mục và video trong deadline production, giữ chính sách ngày gốc đã được duyệt của nguồn.'),
 ('vietnamfdi.vn','network','Homepage/bài/RSS vẫn timeout qua 11 proxy. Sáu mẫu lưu có đồng hồ gốc nhưng chưa xác minh múi giờ; selector scoped đã sửa trước đó.','Cần khôi phục truy cập; sau đó cần bằng chứng múi giờ gốc hoặc xác nhận chính sách dữ liệu rõ ràng.','HTTP đạt deadline và timezone/publication ownership được xác minh; chỉ nới timezone không giải quyết timeout.'),
 ('vinh24h.vn','network','Trang chủ/bài/hostname thay thế/RSS đều timeout; 11 proxy chưa có đường đạt deadline.','Chủ website khôi phục/tối ưu dịch vụ hoặc cung cấp feed/API toàn văn chính thức.','Seed và bài gốc đáp ứng deadline production, sau đó vượt parser/identity/publication gate.'),
]
assert len(rows) == 25 and set(batch['cohort']) == {x[0] for x in rows}
assert len(batch['sites']) == 25 and len({x['site'] for x in batch['sites']}) == 25
assert batch['aiLedgerUnchanged'] and batch['aiUsage'] == supp['aiUsage']
assert not any(p.get('doc') for s in batch['sites'] for p in s['probes'])
assert not any(p.get('audit',{}).get('proposal') for s in batch['sites'] for p in s['probes'])
old = {s['site']:s for s in prior['sites']}
fresh = {s['site']:s for s in batch['sites']}
cases = []
for site,group,reason,action,reopen in rows:
 s=fresh[site]
 cases.append({'site':site,'caseState':'closed_with_external_dependency' if group!='native_data' else 'closed_with_native_data_blocker',
  'group':group,'restored':False,'reason':reason,'requiredAction':action,'reopenWhen':reopen,
  'owner':'publisher; data-policy decision additionally needed where stated',
  'lastCheckedAt':batch['finishedAt'],'configSha256':s['fileSha'],'runtimeAlerts':s['alerts'],
  'currentEvidence':[{k:p[k] for k in ['url','statusCode','error','checkedAt','file','title','audit'] if k in p} for p in s['probes']],
  'deferred':s.get('deferred'),'earlierEvidence':old[site]})
report={'cohort':batch['cohort'],'at':supp['finishedAt'],'all25Closed':True,'restoredInThisPass':0,
 'meaning':'Investigation completed with explicit dependencies; sources remain blocked, not marked healthy or permanently dead.',
 'groupCounts':dict(Counter(r[1] for r in rows)),'paidAiCallsInThisPass':0,'paidAiUsdInThisPass':0,'astraUsed':False,
 'budget':{'qcTotalCeilingUsd':15,'dailyCeilingUsd':2,'dailyMaxCalls':200,'authoritativeLedger':'existing VPS SQLite ai_usage','ledgerUnchanged':True},
 'changes':'No production code/config/queue/data writes in this pass; saved closeout and evidence only.',
 'evidenceFiles':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ['batch.json','supplement.json','payload-inspection.json','prior-cases.json']},'cases':cases}
(ROOT/'source-closeout.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
localtime=datetime.fromisoformat(supp['finishedAt'].replace('Z','+00:00')).astimezone(timezone(timedelta(hours=7)))
lines=[f'CHỐT TRỌN LƯỢT 25 NGUỒN NEWS — {localtime:%d/%m/%Y %H:%M} UTC+7','',
 'KẾT QUẢ: Đã kiểm tra lại và chốt đủ 25/25 hồ sơ; không có nguồn nào đủ điều kiện khôi phục mới ở lượt này.',
 '14 nguồn vướng truy cập/DNS/TLS/backend; 4 nguồn đóng/suspended/URL bài 404; 7 nguồn thiếu dữ liệu gốc hoặc sai nội dung.',
 f"Bằng chứng mới: {sum(len(s['probes']) for s in batch['sites'])} lượt thăm dò HTTP theo cohort, {len(supp['checks'])} kiểm tra RSS/API bổ sung, DNS A/AAAA và TLS strict. Giacavattu đọc metadata production và mẫu đã lưu, không phát HTTP thủ công do crawl policy.",
 'Đối chiếu thêm bằng chứng cùng ngày: ma trận 13 tài nguyên khó × 11 proxy = 143 lần kiểm, không có route thành công. Không chạy lại hàng loạt sau 401/403/429.',
 'Đây là chốt điều tra với điều kiện mở lại, không phải xác nhận nguồn đã khỏe. Các cảnh báo/cách ly hiện có được giữ, không tự xóa lỗi hoặc mở hàng loạt URL.',
 'Không sửa code/config production, không đổi queue/ES trong lượt này. Seed/parse/import đang active ở đầu lượt; bản chốt cuối được kiểm riêng trong final-state.json.',
 'Không gọi AI API; phát sinh 0 USD, không dùng Astra. Sổ ai_usage không đổi. Giữ trần 2 USD/ngày UTC và 200 calls/ngày; ngân sách 15 USD là tổng cho đợt QC, không phải mức chi đã dùng.',
 'Không có cơ sở tự thay ngày cập nhật thành ngày đăng, điền giờ/múi giờ thiếu, hoặc dùng tóm tắt làm toàn văn.',
 '', 'CHI TIẾT TỪNG NGUỒN']
for i,c in enumerate(cases,1):
 lines += [f"{i:02}. {c['site']} [{c['group']}]",f"    Nguyên nhân: {c['reason']}",f"    Cách xử lý: {c['requiredAction']}",f"    Mở lại khi: {c['reopenWhen']}"]
lines += ['', 'BẰNG CHỨNG VÀ GIỚI HẠN',
 'source-closeout.json chứa đủ 25 hồ sơ, SHA cấu hình live, lỗi HTTP/gate và điều kiện mở lại.',
 'batch.json lưu HTML evidence gzip trên VPS theo SHA; supplement.json chứa RSS/REST, chứng chỉ, DNS, ledger và lịch sử request Giacavattu.',
 'payload-inspection.json đọc lại nội dung API BigGo đã lưu cùng ngày; đây không phải lượt tải BigGo API mới.',
 'prior-cases.json giữ bằng chứng các đường mobile/feed/API và ma trận proxy đã kiểm trong lượt trước cùng ngày.',
 'Giacavattu: host_limits trống và lịch sử wire thực tế khoảng 8 phút/lần, phù hợp runner không cooldown nhưng không đáp ứng crawl-delay khai báo. Lượt này không đổi kiến trúc không cooldown được ghi trong docs/news-three-flows.md; đây là điều kiện vận hành cần giải quyết cùng publisher trước khi mở bài.',
 'VietnamFDI: chưa có xác nhận mới về múi giờ. Dù đổi chính sách ngày giờ, lỗi truy cập vẫn cần được xử lý.',
 'Không thêm nguồn thay thế chưa được xác minh hoặc fireant.vn. Không liên hệ publisher thay người dùng.']
(ROOT/'QC-REPORT.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'cases':len(cases),'restored':0,'groups':report['groupCounts'],'newHttpProbes':sum(len(s['probes']) for s in batch['sites']),'paidAiUsd':0}))
