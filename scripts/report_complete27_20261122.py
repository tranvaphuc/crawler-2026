"""Close out the entire 27-source cohort, including every category of the restored sites."""
import json
from pathlib import Path
from collections import Counter
from datetime import datetime,timedelta
root=Path('outputs/news-complete27-2026-11-22')
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
post,qualified,matrix,coverage,residual=[read(root/f) for f in ['postcheck.json','qualified-sites.json','proxy-matrix.json','seed-coverage.json','residual-articles.json']]
prior=read(Path('outputs/news-remaining27-all-2026-11-22/source-disposition.json'))
routes,extra=read(root/'route-controls.json'),read(root/'extra-controls.json')
assert post['verified'] and post['remaining']==25 and post['readbacks']==26
rows=[]
for old in prior['sites']:
    site=old['site'];current=next(s for s in post['sites'] if s['site']==site)
    row={**old,'alerts':current['alerts'],'enabled':current.get('enabled',old.get('enabled'))}
    if site in ['molistar.com','saoexpress.vn']:
        row.update(disposition='restored_verified_production',category='restored',reason=('Đã sửa parser sang WordPress API gốc và giới hạn route vào news-p03/news-p04 đã kiểm chứng; body/ngày đăng giữ đúng publisher.' if site=='molistar.com' else 'User-Agent mặc định bị 403; User-Agent chuẩn trả 200 trong kiểm tra cùng proxy. Đã bật profile theo publisher, giữ parser gốc.'),requiredAction='Luồng đang chạy; chỉ các bài không đủ field gốc tiếp tục giữ review.')
        row['productionStats']=[s for s in post['articleStats'] if s['site']==site]
        row['seedCoverage']=[{'url':s['url'],'status':s['after']['status'],'links':s['after']['links_found']}for s in coverage['sources']if s['site']==site]
    m=next((m for m in matrix['sites'] if m['site']==site),None)
    if m:row['proxyMatrix']={'url':m['url'],'proxiesChecked':len(m['checks']),'results':[{'proxyId':p['proxyId'],'error':p.get('error'),'statusCode':p.get('statusCode')}for p in m['checks']]}
    row['newRouteControls']=[p for p in routes['checks'] if p['site']==site]
    row['extraControls']=[p for p in extra['checks'] if p['site']==site]
    if site=='gialaitv.vn':row['reason']+=' Đã kiểm tra thêm đúng REST post ID 879384 và 879360, cả hai route URL/REST query đều 503; REST post ID cũng 503 trên cả 11 proxy.'
    if site=='giacavattu.com.vn':row['reason']+=' Metadata HTTP production ngày 22/11 xác nhận homepage vẫn 200, có link; không tạo thêm request thủ công trong cửa sổ crawl-delay. Publication của bài vẫn dựa vào chứng cứ gốc đã lưu.'
    rows.append(row)
remaining=[r for r in rows if r['alerts']]
out={'at':post['at'],'reviewed':27,'restored':2,'remaining':25,'verifiedEsReadbacks':26,'newEsCreatesSinceDeployment':sum(s['n'] for s in post['importStats'] if s['status']=='created'),'paidAiApiCalls':0,'paidAiApiUsd':0,'proxyMatrix':{'sites':len(matrix['sites']),'proxies':len(matrix['proxyIds']),'checks':sum(len(s['checks'])for s in matrix['sites'])},'remainingCategories':dict(Counter(s['category'] for s in remaining)),'publicationPolicyChanged':False,'sites':rows}
(root/'source-disposition.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
time=(datetime.fromisoformat(post['at'].replace('Z','+00:00'))+timedelta(hours=7)).strftime('%d/%m/%Y %H:%M UTC+7')
counts=Counter((s['site'],s['after']['status'])for s in coverage['sources'])
seed_text=', '.join(f'{site}: {n} seed {status}'for (site,status),n in counts.items())
text=f'''QC TRỌN LƯỢT 27 NGUỒN NEWS — {time}

KẾT QUẢ
- Đã xét toàn bộ 27 nguồn trong cùng lượt, gồm các đường HTTP/HTTPS, User-Agent, API post ID và các bằng chứng DNS/TLS/publication có liên quan.
- Khôi phục Molistar và SaoExpress; cảnh báo nguồn giảm 27 -> 25. Đây là 2 nguồn được triển khai và xác nhận trên production, không phải chỉ đổi trạng thái hiển thị.
- Đối chiếu 26 bài cụ thể sau ghi ES: 26/26 khớp URL, title, content, description, publishedDate. Tính từ lúc triển khai sửa đến mốc kiểm tra, hai nguồn tạo thêm {out['newEsCreatesSinceDeployment']} bản ghi ES. Không ghi đè document đã tồn tại.
- Kiểm tra chéo 13 nguồn khó truy cập trên cả 11 proxy hiện có: 143 phép đọc. Tất cả vẫn lỗi, nên không gỡ chặn bằng cách bỏ TLS, lấy đoạn tóm tắt thay toàn văn hoặc bịa ngày đăng.
- Chi phí AI API phát sinh trong lượt: 0 USD; không dùng Astra. Sổ ai_usage không đổi, AI_DAILY_BUDGET_USD=2 và daily call limit hiện hành được giữ. Ngân sách người dùng cho toàn đợt QC vẫn là tổng 15 USD, không phải 15 USD/ngày.

MOLISTAR
- HTML không còn đủ field theo parser cũ. Sử dụng adapter declared_wordpress_post đang có để lấy title/body/description/date_gmt từ API WordPress được chính HTML bài khai báo; kiểm tra URL và native post ID.
- Source http.proxyIds chỉ dùng news-p03/news-p04: cùng một bài, hai proxy này trả 200; nhiều proxy khác trả 520. Giữ xoay request giữa các route đủ điều kiện, không fallback gọi thẳng.
- Năm bài đóng băng ban đầu, gồm 2 holdout độc lập, vượt toàn bộ gate publication/identity/body. Cả 5 được kiểm tra lại qua routing mới, field gốc không đổi.
- Rà lại toàn bộ 14 URL fail còn sót của nguồn, kiểm chứng độc lập rồi mới requeue. Tại mốc cuối: 50 bài done, không còn bài fail trong article_links của Molistar.

SAOEXPRESS
- Kiểm tra cùng news-p01/news-p02: User-Agent nghiên cứu trả 403, User-Agent chuẩn trả 200. Bổ sung profile riêng cho hostname, không thay header các publisher khác.
- Parser gốc vượt kiểm tra trên 5 bài, gồm 2 holdout độc lập. Bật lại nguồn và giới hạn maxConcurrentArticles=1.
- Rà cả 3 URL fail còn sót: 2 URL vượt gate và được requeue; 1 bài ảnh còn giữ review vì HTML và REST post 29779 đều không có description/excerpt gốc. Không tự dùng tiêu đề hay AI viết description để lấp thiếu.
- Tại mốc cuối: 774 bài done, 1 bài fail do thiếu mô tả gốc.

DANH MỤC VÀ LUỒNG THẬT
- Đã đi qua toàn bộ seed cấu hình của hai nguồn bằng ThreeFlowProcessor thật: {seed_text}.
- Seed HTTP 200 nhưng không có link vẫn giữ đúng reason no_article_links; không báo đã có bài ở seed rỗng.
- Các URL fail chỉ được mở lại sau khi chính URL đó vượt gate. Không requeue cả site theo vài mẫu; không xoá hàng loạt lỗi hay thay đổi ngày đăng để làm giảm cảnh báo.
- Seed/parse/import đều active, NRestarts=0. Importer giữ PID 1161405. File cấu hình triển khai khớp SHA-256.
- 45/45 kiểm tra VPS đạt, gồm HTTP transport, route theo source, publisher API identity; 4 kiểm tra routing mới cũng đạt tại local. Dùng capability proxyIds đã có trên VPS, không ghi đè các thay đổi transport live khác.

25 NGUỒN CÒN VƯỚNG
- 14 nguồn lỗi DNS/TLS/giới hạn truy cập hoặc backend/timeout.
- 4 nguồn đóng/suspended hoặc URL bài trả 404.
- 7 nguồn thiếu bằng chứng publication gốc hoặc nội dung lặp/sai.
- Giữ nguyên quy tắc ngày/giờ đăng. Câu hỏi về chấp nhận ngày gốc YYYY-MM-DD và timezone địa phương VietnamFDI chưa có câu trả lời ở mốc báo cáo; không coi việc chờ là đồng ý. VietnamFDI hiện còn timeout trên cả 11 proxy, nên riêng nới chính sách thời gian cũng chưa đủ khôi phục HTTP.

KẾT LUẬN TỪNG NGUỒN
'''
for n,s in enumerate(rows,1):text+=f"{n:02}. {s['site']} [{s['category']}]\n    {s['reason']}\n    Cần: {s['requiredAction']}\n"
text+='''
BẰNG CHỨNG
- postcheck.json: trạng thái thật, receipt ES, kết quả đối chiếu field và ledger.
- qualified-sites.json, molistar-routing-verified.json trên VPS: parser đóng băng, native fields, holdout và route.
- proxy-matrix.json: đủ 13 x 11 phép đọc; route-controls.json, extra-controls.json: User-Agent/HTTP và API ID.
- final-dns-tls.json: DNS NXDOMAIN; leaf dailo.vn hết hạn 18/11/2026, *.kinhteplus.com.vn hết hạn 14/11/2026; tieudungso alert TLS 80.
- seed-coverage.json, residual-articles.json, native-description-check.json: kết quả đủ danh mục và từng URL còn fail của hai nguồn phục hồi.
- source-disposition.json: đủ 27 nguồn, trong đó 25 còn cảnh báo.
- Backup VPS: /var/lib/news-flow/qc-complete27-20261122/apply-before.json và routing-apply-before.json.
- Không thêm fireant.vn hoặc subdomain; không thay key API hay số dư ledger.
'''
(root/'QC-REPORT.txt').write_text(text,encoding='utf-8')
print(json.dumps({k:out[k]for k in ['reviewed','restored','remaining','verifiedEsReadbacks','newEsCreatesSinceDeployment','remainingCategories']},ensure_ascii=False))
