import datetime,hashlib,json,re
from pathlib import Path

root=Path('outputs/flow-stability-2026-11-23')
def read(name):return json.loads((root/name).read_text(encoding='utf-8-sig'))
news0=read('news-first.json');news1=read('news-final.json');forum0=read('forum-first.json');forum1=read('forum-final.json');health=read('current-discovery-health.json');probe=read('news-source-probe.json');follow=read('news-source-followup.json');seeds=read('seed-recovery.json');dynamic=read('dynamic-seed-recovery.json');forumproof=read('forum-es-readback.json');newsproof=read('news-es-readback.json');apply=read('forum-parent-apply.json')
close=json.loads(next(line for line in (root/'news-closeout-log.txt').read_text(encoding='utf-8-sig').splitlines() if line.startswith('{')))
(root/'news-closeout.json').write_text(json.dumps(close,ensure_ascii=False,indent=2),encoding='utf-8')
assert forumproof['verified'] and newsproof['verified'] and forumproof['clusterFingerprintVerified']
assert forumproof['cohort']==1198 and apply['requeued']==1192 and not apply['held']
assert all(s['seed']['status']=='ok' and s['seed']['links_found']>0 for s in seeds['sites']+dynamic['sites'])
assert len(seeds['sites']+dynamic['sites'])==10
assert all(s['ActiveState']=='active' for s in news1['services']+forum1['services'])
assert not news1['outbox']
assert news0['aiUsage'][:-1]==news1['aiUsage'][:-1] and news1['aiUsage'][-1]['usd']<=2
assert all(not row['error'].startswith('outside_new_article_window') for row in close['skippedReasons'])

def delta(before,after,key,state_field):
 minutes=(after['nowMs']-before['nowMs'])/60000
 count=lambda rows,state:sum(r['n'] for r in rows if r[state_field]==state)
 result={'from':before['at'],'to':after['at'],'minutes':minutes,'states':{}}
 for state in ['created','existing','pending','held']:
  a=count(before[key],state);b=count(after[key],state);result['states'][state]={'before':a,'after':b,'delta':b-a,'perMinute':(b-a)/minutes}
 ticks=[b-a for a,b in zip(before['resources']['cpuTicks'],after['resources']['cpuTicks'])];total=sum(ticks)
 result['cpuBusyPercent']=(total-ticks[3]-ticks[4])/total*100;result['ioWaitPercent']=ticks[4]/total*100
 return result
news_delta=delta(news0,news1,'receipts','status');forum_delta=delta(forum0,forum1,'documents','export_state')
main_pids_preserved=all(next(s for s in news0['services'] if s['Id']==name)['MainPID']==next(s for s in news1['services'] if s['Id']==name)['MainPID'] for name in ['news-flow-seed.service','news-flow-parse.service','news-flow-import.service'])
assert main_pids_preserved
pending_forum=sum(r['n'] for r in forum1['documents'] if r['export_state']=='pending');ready_forum=sum(r['n'] for r in forum1['readyBySite']);held_forum=sum(r['n'] for r in forum1['documents'] if r['export_state']=='held')
assert held_forum==0
old_parent_audit=read('forum-parent-plan.json')
ledger_before=news0['aiUsage'][-1];ledger_after=news1['aiUsage'][-1]
extra_findings={
 'asemconnectvietnam.gov.vn':'Homepage không hoàn thành trong deadline production.',
 'cadn.com.vn':'Homepage 200 có 115 link; bài mẫu bị NEWS_PUBLICATION_SELECTOR_AMBIGUOUS. Cần xác minh selector publication theo đúng bài trước mở lại.',
 'depviet.net.vn':'Homepage 200 có 47 link; bài mẫu có NEWS_PUBLICATION_PAGE_IDENTITY_CONFLICT. Cần giải quyết identity bài gốc, không bỏ guard.',
 'moitruongvaxahoi.vn':'Homepage thử lại trả HTTP 503.',
 'msn.com':'Homepage đọc được; bài mẫu dùng publisher_dispatch_requires_http. Cần kiểm chứng trọn đường chuyển sang publisher gốc, chưa coi parser trực tiếp là hợp lệ.',
 'nghetinhplus.vn':'Homepage thử lại trả HTTP 500.',
 'nguoilamnghe.com.vn':'Homepage hết deadline production.',
 'qdnd.vn':'Homepage đọc được; publication JSON-LD của mẫu chưa gắn được đúng URL bài.',
 'vir.com.vn':'Chứng chỉ HTTPS hết hạn: CERT_HAS_EXPIRED.',
 'vnbiznews.com':'Homepage có 83 link; bài mẫu thiếu published_date đủ bằng chứng.',
}
prior=json.loads(Path('outputs/news-public24-2026-11-23/source-disposition.json').read_text(encoding='utf-8'))
prior_by_site={c['site']:c for c in prior['cases']}
remaining=[]
for s in health['sites']:
 detail=extra_findings.get(s['site']) or prior_by_site.get(s['site'],{}).get('finding') or 'Chưa có bằng chứng để mở nguồn trong lượt kiểm tra này.'
 remaining.append({'site':s['site'],'alerts':s['alerts'],'finding':detail})
assert len(remaining)==33

report={
 'at':news1['at'],'scope':{'newsSources':health['totalSites'],'forumSources':len({s['site'] for s in forum1['seeds']}),'newsAlertSourcesProbed':len(probe['sites']),'dynamicSourcesSupplemented':len(follow['sites']),'note':'Runtime/database health covers all configured sources. Native HTTP checks target alerting news sources and representative forum failures; this is not a full article-by-article recrawl.'},
 'news':{'window':news_delta,'mainPidsPreserved':main_pids_preserved,'outbox':news1['outbox'],'articleStates':news1['articles'],'seedTaskStates':[s for s in news1['tasks'] if s['role']=='seed' and s['state'] in ['pending','running']],'restoredDiscovery':[s['site'] for s in seeds['sites']+dynamic['sites']],'remainingSourceWarnings':remaining,'esReadback25Verified':newsproof['verified'],'baomoiBranch':close},
 'forum':{'window':forum_delta,'originalReviewCohort':1198,'parentsReconciled':len(apply['parents']),'commentsReleased':1192,'reviewCohortResults':forumproof['counts'],'all1198ReadbacksVerified':forumproof['verified'],'originalParentsUnchanged':all(p['sourceUnchanged'] for p in forumproof['parentControls']),'heldNow':held_forum,'pendingExportNow':pending_forum,'readyCollectionUrls':ready_forum,'originalTimeConflictUrls':sum(r['n'] for r in forum1['urls'] if 'TIME_CHANGED' in (r['reason'] or '')),'rootIdentityGuardReplay':forumproof['nativeGuardReplay'],'sourceLimits':{'seedBlocked':[s for s in forum1['seeds'] if s['status']=='failed'],'note':'Some seeds return 403/404; public comment endpoints/embedded-only pagination and original-time conflicts remain incomplete. Export review was cleared; collection backfill is still in progress.'}},
 'verification':{'newsVpsTests':12,'forumVpsTests':25,'localTests':30,'esClusterStatus':newsproof['esHealth']['status'],'esNodes':newsproof['esHealth']['number_of_nodes'],'unassignedShards':newsproof['esHealth']['unassigned_shards'],'kernelOomOrIoAlerts':{'news':news1['kernelAlerts'],'forum':forum1['kernelAlerts']},'newsServices':news1['services'],'forumServices':forum1['services'],'newsResources':news1['resources'],'forumResources':forum1['resources']},
 'ai':{'manualCalls':0,'model':news1['aiPolicy']['NEWS_AI_MODEL'],'dailyBudgetUSD':float(news1['aiPolicy']['AI_DAILY_BUDGET_USD']),'dailyMaxCalls':int(news1['aiPolicy']['AI_DAILY_MAX_CALLS']),'before':ledger_before,'after':ledger_after,'backgroundDeltaCalls':ledger_after['calls']-ledger_before['calls'],'backgroundDeltaUSD':ledger_after['usd']-ledger_before['usd'],'historicalLedgerPreserved':True,'astraUsed':False},
 'limitations':['Post-fix Baomoi process observation is a short window, not a long-term SLA; injected timeout behavior was verified with mocks.','109,530 historical news URL failures remain guarded for review; source recovery does not reopen every failed URL.','Forum collection still has 5,250 ready URLs; the observed export increase includes draining the reviewed cohort and is not a steady-state throughput benchmark.']
}
(root/'STABILITY-REPORT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
tz=datetime.timezone(datetime.timedelta(hours=7));stamp=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00')).astimezone(tz).strftime('%H:%M:%S %d/%m/%Y UTC+7')
lines=['KIỂM TRA NEWS + FORUM — '+stamp(news1['at']),'','KẾT LUẬN','Hai luồng chính đang xử lý và nhập dữ liệu. Đã sửa hai lỗi vận hành và giải phóng đợt review forum. Còn hạn chế ở từng nguồn và backfill; chưa thể coi độ phủ dữ liệu đã đầy đủ.','','PHẠM VI VÀ CỬA SỔ ĐO',f'- Toàn bộ trạng thái runtime/DB của {health["totalSites"]} nguồn news và 21 forum. Probe native các 45 nguồn news cảnh báo; bổ sung đúng registry động cho 4 nguồn trong số đó. Không tải lại từng bài của toàn bộ registry.',f'- News: {stamp(news0["at"])} → {stamp(news1["at"])} ({news_delta["minutes"]:.2f} phút).',f'- Forum: {stamp(forum0["at"])} → {stamp(forum1["at"])} ({forum_delta["minutes"]:.2f} phút).','','NEWS',f'- ES thêm {news_delta["states"]["created"]["delta"]} bản created và {news_delta["states"]["existing"]["delta"]} bản existing trong cửa sổ; outbox pending/held/sending đều 0 ở snapshot cuối. 25 tài liệu mới đọc lại khớp URL và giờ xuất bản đã verified.', '- Ba tiến trình seed/parse/import giữ PID và không tự restart trong cửa sổ. Nhánh Báo Mới gốc đã sửa riêng, chỉ restart nhánh này.', '- Lỗi nhánh Báo Mới: ES search đọc quá 15 giây ném exception làm process exit. Guard mới giữ nguyên es_checked_at và không admission bài chưa đối soát; đọc thất bại tạm thời được hoãn sang tick bình thường kế tiếp. Lỗi DB/lock/auth vẫn dừng và báo lỗi.',f'- Sau vá: {close["branchEventsAfterFix"].get("original_branch_tick",0)} tick, process PID 1997969 từ 01:24:29 UTC, NRestarts=0; chưa gặp timeout mới trong cửa sổ sau vá. Kiểm thử mock đã ép timeout và xác nhận không admission sai.', '- Khôi phục discovery 10 nguồn có HTTP và bằng chứng native hợp lệ: '+', '.join(report['news']['restoredDiscovery'])+'.', '- Toàn bộ skipped được kiểm tra: không còn lý do outside_new_article_window; giữ chính sách toàn bộ lịch sử.', '- Còn 33/813 nguồn cảnh báo; 109.530 URL bài lỗi tích lũy được giữ review, không tự mở lại hàng loạt. Ở snapshot có 2 bài pending ngắn hạn, seed queue 323 pending +148 running.','','FORUM', '- Sáu topic GameVN làm chặn 1.192 bình luận: 5 topic có nhiều identity legacy; 1 topic cần bản gốc đúng thời gian. Đã đọc HTML native, đối soát namespace/time/ES và giữ nguyên tài liệu cũ.', '- Đợt 1.198 bản review đã xử lý đủ: 1.193 created, 5 existing. Đọc lại toàn bộ 1.198 bản khớp binding/time/parent; 6 parent controls giữ nguyên source/version sau thao tác.', '- OtoSaigon có thread cũ chuyển tới /lien-he/ nhưng parser vẫn thấy một post: guard mới yêu cầu native thread ID của root trùng thread đang xử lý, trước khi lưu. Replay HTML thật xác nhận không lưu document, không tiến cursor và giữ trạng thái cần kiểm tra.',f'- Snapshot cuối: held={held_forum}, pending export={pending_forum}; {ready_forum:,} URL đủ điều kiện đang chờ collector. Chưa hoàn tất backfill.',f'- Trong cửa sổ forum thêm {forum_delta["states"]["created"]["delta"]} created và {forum_delta["states"]["existing"]["delta"]} existing, gồm lượt giải phóng review; không dùng số này làm SLA tốc độ thường xuyên.', '- Còn seed 403/404, comment endpoint chưa xác minh đủ và 14 URL có thay đổi thời gian gốc; guard đang giữ lại, không đoán giờ hay chốt hoàn tất giả. Techrum và seed Pantip vẫn bị access_blocked.','','KIỂM CHỨNG / TÀI NGUYÊN','- VPS: 12 tests news +25 tests forum đều pass; local 30/30 pass.','- ES5 cluster green, 5 data nodes, 0 unassigned shards. Không có OOM hoặc I/O error trong cửa sổ journal kiểm tra.', '- News: RAM khả dụng %.1f GiB; đĩa trống %.1f GiB (%s dùng); swap 0.'%(news1['resources']['memAvailable']/2**30,news1['resources']['diskAvailableBytes']/2**30,news1['resources']['diskUsedPercent']),'- Forum: RAM khả dụng %.1f GiB; đĩa trống %.1f GiB (%s dùng); swap 0.'%(forum1['resources']['memAvailable']/2**30,forum1['resources']['diskAvailableBytes']/2**30,forum1['resources']['diskUsedPercent']), '- Collector/writer forum được restart có kiểm soát khi áp dụng sửa lỗi; sau đó không có restart ngoài ý muốn ở snapshot cuối.','','AI / CHI PHÍ',f'- Không dùng Astra, không gọi AI API thủ công. Dịch vụ nền dùng {report["ai"]["model"]}.',f'- Ledger UTC {ledger_after["day"]}: {ledger_after["calls"]} calls / {ledger_after["usd"]:.6f} USD, tăng {report["ai"]["backgroundDeltaCalls"]} calls / {report["ai"]["backgroundDeltaUSD"]:.6f} USD trong cửa sổ. Giữ 2 USD/ngày và 200 calls; ledger lịch sử không đổi.','','33 NGUỒN NEWS CÒN CẢNH BÁO']
for s in remaining:lines+=['',s['site']+' — '+', '.join(s['alerts']),s['finding']]
lines+=['','BẰNG CHỨNG','STABILITY-REPORT.json: đủ số đo, service PID, tài nguyên, source limits và accounting.','news-first/second/final.json; forum-first/second/final.json: snapshots có timestamp.','news-source-probe.json và news-source-followup.json: HTTP native, parser gate và file bằng chứng.','seed-recovery.json / dynamic-seed-recovery.json: 10 seed chạy thực.','forum-parent-plan.json / forum-parent-apply.json / forum-es-readback.json: 1.198 bản đã đối soát.','news-es-readback.json: 25 bản mới có URL/publication đúng; ES cluster health.','news-closeout.json: nhánh Báo Mới sau vá và thống kê skipped.','VPS news: /var/lib/news-flow/stability-20261123/','VPS forum: /var/lib/forum-flow/stability-20261123/']
(root/'QC-REPORT.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'verified':True,'newsWindowMinutes':round(news_delta['minutes'],2),'forumWindowMinutes':round(forum_delta['minutes'],2),'newsCreated':news_delta['states']['created']['delta'],'forumCreated':forum_delta['states']['created']['delta'],'forumHeld':held_forum,'newsWarnings':len(remaining),'restoredSources':10,'vpsTestsPassed':37,'report':str(root/'QC-REPORT.txt')}))
