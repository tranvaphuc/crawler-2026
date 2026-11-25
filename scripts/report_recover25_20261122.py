import json,hashlib
from pathlib import Path
from datetime import datetime,timezone,timedelta
root=Path('outputs/news-recover25-2026-11-22')
read=lambda f:json.loads((root/f).read_text(encoding='utf-8'))
post,all_es,follow,qualified,tls,cold,expired=map(read,['postcheck.json','all-cnn-es-readback.json','all25-followup.json','cnn-qualified.json','tls-version-controls.json','cnn-public-proof.json','cnn-expired-closeout.json'])
old=json.loads(Path('outputs/news-alt25-2026-11-22/source-disposition.json').read_text(encoding='utf-8'))
assert post['verified'] and post['remaining']==24 and not post['residualFailures']
assert len(follow['sites'])==25 and len({s['site'] for s in follow['sites']})==25
assert follow['aiLedgerUnchanged'] and post['aiLedgerUnchanged'] and qualified['approved']
assert len(all_es['rows'])==85 and all_es['verified'] and all(x['proofMatched'] for x in all_es['rows'])
assert len(post['esReadback'])==5 and all(x['exactMatch'] for x in post['esReadback'])
assert len(tls['checks'])==12 and all(s.get('error') for s in tls['checks'])
assert all(p['flag'] is False and p['restrictedSelectorPresent']==0 and p['visibleGate']==0 for p in cold['archived'])
stats={s['parse_status']:s['n'] for s in post['articleStats']}
assert stats=={'done':85,'skipped':14}
extra={s['site']:s for s in follow['sites']}
decision={
 'decision':'Restore only CNN publisher Lite representations whose complete body and original publication are positively verified on every article.',
 'kind':'cnn_lite_public_full_text_v1','scope':'edition.cnn.com source, official https://lite.cnn.com representation only',
 'observedNativeFlag':False,'nativeHasPartSelector':'.article__content','selectorExistsOnLite':False,
 'evidence':'Cold HTTP requests through separate production proxies returned the complete publisher-rendered .article--lite without login, cookies or a visible access gate. Native paragraphs and editorial metadata are bound to the same canonical URL/headline/original date.',
 'interpretation':'The generic full-site restriction metadata does not by itself establish a gate on this separate public Lite layout. This is a scoped runtime access decision, not a publisher licensing statement.',
 'guards':['strict TLS and production proxies','one exact publisher Lite host/path','canonical URL and headline agree with native JSON-LD','explicit original ISO timestamp','all native paragraphs occur in order in schema body','at least 97% schema text coverage or exact full-body match','no active gate and no restricted-scope DOM node','native description copied from URL-bound schema','raw restriction metadata retained','payload URL/title/body/original time bound to persisted access proof'],
 'unchanged':'Other publishers and gated/truncated CNN pages retain their access checks.',
}
(root/'cnn-access-decision.json').write_text(json.dumps(decision,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
cases=[]
for prior in old['cases']:
 site=prior['site'];s=extra[site]
 if site=='edition.cnn.com':
  c={'site':site,'status':'restored_and_import_verified','restored':True,'seedLinks':99,'newEsCreates':85,'expiredSkipped':14,'failedAtFinalCheck':0,'independentSamples':5,'independentHoldouts':2,'nativeAccessDecision':'cnn-access-decision.json'}
 else:
  checks=s['checks'];c={'site':site,'status':'blocked_after_additional_public_route_checks','restored':False,'newChecks':checks,'previousFinding':prior['currentFinding'],'reopenWhen':prior['reopenWhen']}
  if site in ['dailo.vn','kinhteplus.com.vn','tieudungso.vn']:c['strictTlsVersionControls']=[x for x in tls['checks'] if x['site']==site]
 cases.append(c)
report={'at':all_es['at'],'cohortChecked':25,'restored':['edition.cnn.com'],'remaining':24,'cases':cases,
 'cnn':{'seedLinks':99,'createdEs':85,'done':85,'skippedOutside24h':14,'fail':0,'fullDocumentReadbacks':5,'allRuntimeProofReadbacks':85,'allRuntimeProofsMatched':True},
 'additionalChecks':{'publicRouteChecks':sum(len(s['checks']) for s in follow['sites']),'publicWireRequestsIncludingRedirects':73,'strictTlsControls':12},
 'tests':{'localPassed':88,'vpsPassed':108,'previousSourceControlDocumentsUnchanged':10},
 'paidAiCalls':0,'paidAiUsd':0,'astraUsed':False,'authoritativeAiLedgerUnchanged':True,
 'budgets':{'qcCombinedTotalCeilingUsd':15,'projectDailyCeilingUsd':2,'existingDailyCallLimit':200},
 'services':post['services'],'evidenceHashes':{f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in ['postcheck.json','all-cnn-es-readback.json','all25-followup.json','cnn-qualified.json','tls-version-controls.json','cnn-access-decision.json']}}
(root/'source-disposition.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
t=datetime.fromisoformat(all_es['at'].replace('Z','+00:00')).astimezone(timezone(timedelta(hours=7)))
lines=[f'KHÔI PHỤC CNN VÀ KIỂM TRA TIẾP ĐỦ 25 NGUỒN — {t:%d/%m/%Y %H:%M} UTC+7','',
 'KẾT QUẢ: CNN được khôi phục trên production; nhóm nguồn cảnh báo giảm25→24. Đã kiểm tra tiếp đủ25 nguồn trong cùng lượt, không bỏ lại24 nguồn ngoài danh sách.',
 'CNN: seed thật tìm99 link.85 bản ghi mới được ES xác nhận created;14 bài ngoài cửa sổ24giờ được skipped, không đổi ngày đăng. Không còn bài CNN fail/pending/running ở mốc chốt.',
 'Đọc lại85 document ES: URL/title/body/original date đều khớp access proof đã lưu trước ghi; mô tả đều có. Năm bài qualification được so sánh đầy đủ URL/title/content/description/publishedDate:5/5 khớp chính xác.',
 '', 'CỜ HẠN CHẾ CNN LITE',
 'Cờ isAccessibleForFree=false được giữ nguyên trong JSON-LD nguồn. hasPart của các mẫu trỏ .article__content, trong khi bản Lite không có selector này; nội dung hiển thị tại .article--lite.',
 'Request không đăng nhập qua nhiều proxy trả toàn văn và không có UI/gate đăng nhập. Đây là bằng chứng cho nhánh đọc Lite được publisher công khai, không phải việc đặt mọi cờ false thành true.',
 'Adapter kiểm tra từng bài: host/path chính thức, canonical/headline, ngày đăng gốc ISO có offset, thứ tự mọi đoạn văn và độ phủ nội dung schema, mô tả gốc, không có node hạn chế hoặc nội dung bị cắt. Metadata gốc được giữ lại; access proof có hash nội dung và được gắn vào event/outbox.',
 'Các URL edition.cnn.com cũ giữ URL/ID yêu cầu. Không thay ngày đăng bằng ngày cập nhật; các publisher khác vẫn giữ gate như trước. Nhánh này chỉ áp dụng đúng representation Lite và các điều kiện đã kiểm chứng.',
 '', 'KIỂM CHỨNG TRIỂN KHAI',
 'Cấu hình đóng băng qua5 bài riêng biệt và2 holdout độc lập;10 document đối chứng Molistar/SaoExpress khớp trước/sau. Bản cuối88 kiểm thử local và108 kiểm thử VPS đều đạt.',
 'Seed/parse/import active, NRestarts=0; importer giữ PID1161405. Runtime đã tự xử lý toàn bộ99link, không chỉ nhập5 mẫu kiểm tra.',
 'Review CNN còn sót được xem lại từng URL. Các mô tả biên tập khác đoạn đầu được lấy nguyên từ schema của đúng bài. Bài19/11 có proof ngày đăng gốc nhưng ngoài cửa sổ24h được đánh skipped riêng, không ghi ES và không nới gate toàn văn.',
 '', '24 NGUỒN CÒN LẠI: THỬ TIẾP VÀ KẾT QUẢ']
for i,c in enumerate([c for c in cases if not c['restored']],1):
 lines += [f"{i:02}. {c['site']}"]
 for x in c['newChecks']:
  label=x.get('error') or ('HTTP '+str(x.get('statusCode'))+(', feed '+str(x['feedItems'])+' item' if x.get('feedItems') else ', không có feed hợp lệ'))
  if x.get('posts'):label+=f", REST có{len(x['posts'])}post; body lặp vẫn chưa được sửa"
  lines += [f"    {x['url']} → {label}"]
 if c.get('strictTlsVersionControls'):lines += ['    Kiểm tra thêm TLS1.2/TLS1.3, ALPN HTTP1.1 trên2proxy, giữ xác minh certificate: không có cấu hình thành công.']
 lines += [f"    Kết luận: {c['previousFinding']}",f"    Điều kiện mở lại: {c['reopenWhen']}"]
lines += ['', 'NGÂN SÁCH VÀ BẰNG CHỨNG',
 'AI API mới0lần/0USD; không dùng Astra. ai_usage giữ nguyên. Tổng trần QC15USD, dự án2USD/ngày UTC và daily call limit200 được giữ. Ngày UTC chỉ đổi lúc07:00 giờ Việt Nam.',
 f"Thử thêm{report['additionalChecks']['publicRouteChecks']}URL public trong cohort (73wire request gồm redirect), cộng12 phép thử TLS strict; các lượt CNN qualification/real flow/review được ghi riêng.",
 'source-disposition.json: đủ25 hồ sơ, CNN restored và24 nguồn còn block cùng bằng chứng.',
 'cnn-access-decision.json/cnn-public-proof.json: căn cứ kỹ thuật kiểm tra cờ Lite. cnn-qualified.json: frozen samples và holdouts.',
 'postcheck.json/all-cnn-es-readback.json: receipts, ES readback, trạng thái nguồn/dịch vụ. cnn-expired-closeout.json: proof và CAS khi bỏ bài cũ.',
 'all25-followup.json/tls-version-controls.json: kết quả từng đường mới. evidence.tar.gz chứa bằng chứng và backup triển khai.',
 'Không thêm fireant.vn, không tắt TLS, không thêm direct HTTP fallback, không reset usage/queue hoặc mở lại hàng loạt URL fail theo vài mẫu.']
(root/'QC-REPORT.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'checked':25,'restored':1,'remaining':24,'created':85,'proofReadbacks':85,'cnnFail':0,'checks':report['additionalChecks'],'aiUsd':0}))
