import collections,datetime,json
from pathlib import Path
root=Path('outputs/qc-review-2026-11-22')
def read(name):return json.loads((root/name).read_text(encoding='utf-8-sig'))
news=read('news-verification.json');forum=read('forum-verification.json');audit=read('news-audit.json');wp=read('wordpress-holdouts.json');by={s['site']:s for s in audit['sites']}
states=collections.Counter(r['export_state'] for r in forum['original288']);classifications=collections.Counter();disposition=[]
for current in news['original39']:
 case=by[current['site']];errors=[r.get('error') for r in case['seeds']]
 kind='healthy' if not current['alerts'] else 'crawl_delay' if case.get('deferred') else 'access_or_transport' if errors and all(errors) else 'publication_or_content_evidence'
 classifications[kind]+=1
 disposition.append({'site':current['site'],'classification':kind,'alerts':current['alerts'],'seedErrors':errors,'articleErrors':[r.get('writeError') or r.get('httpError') for r in case['articles']],'evidence':[r.get('evidence') for r in [*case['seeds'],*case['articles']]],'notes':'Public WordPress API returned repeated body hashes; no parser activation.' if current['site']=='nhansac.vn' else case.get('deferred')})
(root/'source-39-disposition.json').write_text(json.dumps({'at':news['at'],'counts':dict(classifications),'sites':disposition},ensure_ascii=False,indent=2),encoding='utf-8')
stamp=datetime.datetime.fromisoformat(news['at']).astimezone(datetime.timezone(datetime.timedelta(hours=7))).strftime('%H:%M:%S %d/%m/%Y UTC+7')
held=len(forum['held']);original_remaining=sum(r['export_state'] not in ['created','existing','outside_window','context_only'] for r in forum['original288'])
nhansac=next(s for s in wp['sites'] if s['site']=='nhansac.vn');valid=nhansac['pages'];hashes={p.get('contentHash') for p in valid if p.get('doc')}
applies=[read(name) for name in ['forum-apply.json','forum-followup-apply.json','forum-voz-apply.json']]
parent_count=sum(len(a['parents']) for a in applies);comments=sum(a['requeued'] for a in applies)
lines=[
 'QC tiếp news và forum — '+stamp,'',
 'Kết quả đã xác minh trên ES:',
 '- News: đủ 8/8 bản đã có receipt và ra khỏi outbox. Sáu bản giữ precision phút của dữ liệu legacy; VietnamFinance khớp giờ nguồn hiện tại. Vietstock được sửa riêng publishedDate sau hai lần đọc gốc, có version guard và giữ nguyên mọi field khác.',
 f'- Forum: đúng 288 bản của đợt trước đã giải quyết ({states.get("created",0)} created, {states.get("existing",0)} existing), còn {original_remaining} bản chưa xong.',
 f'- Đã xử lý cả lỗi mới phát sinh: {parent_count} parent và {comments} comment được mở khóa. Chỉ tạo một original còn thiếu; các parent lịch sử không bị ghi đè hoặc xóa.',
 f'- Đọc lại 288/288 forum và 8/8 news trên ES: 0 lỗi. Đủ {parent_count}/{parent_count} parent khớp version và hash dữ liệu sau đối soát.',
 f'- Snapshot forum hiện còn {held} held; news outbox hiện trống.' if not news['outbox'] else f'- Snapshot forum hiện còn {held} held; xem news-verification.json cho outbox.',
 '',
 'Sửa mã production:',
 '- Forum writer đối chiếu đúng precision phút đã được cấu hình rõ trong crawler XenForo cũ, sau khi replay native clock. Giờ lệch phút/ngày hoặc sai parent vẫn bị chặn.',
 '- Khi có page-head pseudo-topic, writer chỉ chọn original root đã khớp native identity và clock; trường hợp còn nhiều original thật vẫn giữ để đối soát. Post-create kiểm tra duplicate race vẫn nghiêm ngặt.',
 '- News không còn giữ lỗi HTML shell rỗng sau khi public API/feed đã chuẩn hóa thành công và trích được link. Áp dụng cho URL seed và URL đích redirect thuộc đúng publisher; không xóa lỗi 403, TLS hay timeout.',
 '- Chỉ triển khai các hunk cần thiết lên news, giữ nguyên các thay đổi live khác. Parse/import giữ PID; cấu hình AI giữ nguyên.',
 '',
 '39 nguồn news ban đầu:',
 f'- Đã kiểm tra đủ 39 nguồn, đồng thời rà cả nguồn cảnh báo mới. Snapshot: {classifications.get("healthy",0)} nguồn hết cảnh báo, {39-classifications.get("healthy",0)} nguồn còn cảnh báo.',
 f'- {classifications.get("access_or_transport",0)} nguồn còn lỗi truy cập/transport ở lần probe; {classifications.get("publication_or_content_evidence",0)} nguồn thiếu chứng cứ publication/content đủ chuẩn; {classifications.get("crawl_delay",0)} nguồn giữ lịch crawl-delay của publisher.',
 '- Đã phục hồi 11 seed có HTML và link thật, xóa đúng lỗi/dependency cũ có chứng cứ. Những lỗi mới hơn snapshot được giữ nguyên. Hai seed Tuyên Giáo đã được tải lại và mở đúng alias sau sửa redirect.',
 f'- Nhansac: 5 bài đọc được qua endpoint WordPress được publisher công bố, nhưng chỉ có {len(hashes)} content hash khác nhau. Không bật parser bằng nội dung lặp.',
 '- Dulichgiaitri chỉ cung cấp ngày, không có clock gốc hoặc endpoint post công bố. Tintuctoday/Travelguide không có publication clock thuộc bài trong các mẫu đã kiểm tra. Không dùng ngày của sự kiện, sidebar, giờ crawl hoặc dateModified để thay thế.',
 '- Nhóm TLS hết hạn/chặn truy cập/rate-limit/timeout không có route thay thế đạt kiểm chứng trong giới hạn hiện tại. Không tắt TLS, vượt challenge hoặc sửa toàn cục timeout để làm mất cảnh báo.',
 '- Đây chưa phải kết quả khôi phục đủ 39/39 nguồn. Xem source-39-disposition.json để theo dõi từng nguồn và chứng cứ.',
 '',
 'Kiểm thử và chi phí:',
 '- Regression local cuối: 166 tests, 165 pass, 1 skip, 0 fail. Dùng mock AI và localhost.',
 '- Test trên VPS: forum writer 53/53; news redirect 69/69.',
 '- Kiểm tra 83.753 document forum: không thấy lỗi raw timestamp/index/parent; mẫu đọc lại ES khớp.',
 '- Không phát sinh paid AI API call trong hai lượt QC. ai_usage không đổi so với đầu lượt; không dùng Astra. Tổng ngân sách 15 USD chưa sử dụng cho paid AI của QC.',
 '- Giữ giới hạn 2 USD/ngày UTC và 200 calls/ngày. Không thay hoặc reset ledger, không tạo ledger riêng. Không thêm FireAnt.',
 '',
 'Chứng cứ:',
 'news-verification.json, forum-verification.json, news-import-resolution.json,',
 'news-es-readback.json, forum-es-readback.json, source-39-disposition.json,',
 'tests-final.txt, forum-full-data-check.txt, news-audit.json, http-routes.json,',
 'wordpress-holdouts.json, verified-recovery.json, tuyengiao-root-reopen.json.',
 'Các backup code/state và source ES trước sửa nằm trong /var/backups/news-flow,',
 '/var/backups/forum-flow và /var/lib/news-flow/qc-20261122 trên các VPS tương ứng.'
]
(root/'QC-REVIEW-REPORT.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8');print(json.dumps({'report':str(root/'QC-REVIEW-REPORT.txt'),'sourceClasses':dict(classifications),'originalForumStates':dict(states),'newForumHeld':held}))
