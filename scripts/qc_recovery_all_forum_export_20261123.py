import json,sqlite3,time,subprocess
from pathlib import Path
root=Path('/var/lib/forum-flow/recovery-all-20261123');audit=sqlite3.connect(root/'audit.sqlite');audit.row_factory=sqlite3.Row
live=sqlite3.connect('file:/var/lib/forum-flow/runtime/state.sqlite?mode=ro',uri=True);live.row_factory=sqlite3.Row
counts={};sites={};details=[];now=int(time.time()*1000)
for item in audit.execute('SELECT * FROM cohort').fetchall():
 before=json.loads(item['before_json']);row=live.execute('SELECT * FROM forum_urls WHERE site=? AND native_id=?',(item['site'],item['native_id'])).fetchone();after=dict(row) if row else None
 if not after:status='removed'
 elif after.get('completed_at',0) and (after['completed_at'] or 0)>(before.get('completed_at') or 0):status='completed_since_snapshot'
 elif any(after.get(k)!=before.get(k) for k in ['resume_url','next_at','last_page_num','target_last_page','scan_floor_page','processed','reason']):status='attempted_or_checkpoint_changed'
 elif before.get('completed_at'):status='previously_completed_poll_due'
 elif after.get('reason'):status='unchanged_with_reason'
 else:status='unattempted_initial_backlog'
 counts[status]=counts.get(status,0)+1;s=sites.setdefault(item['site'],{});s[status]=s.get(status,0)+1
 audit.execute('UPDATE cohort SET status=?,last_observed=? WHERE site=? AND native_id=?',(status,json.dumps(after,ensure_ascii=False),item['site'],item['native_id']))
 if status in ['unattempted_initial_backlog','unchanged_with_reason']:details.append({'site':item['site'],'native_id':item['native_id'],'reason':after.get('reason') if after else None,'resume_url':after.get('resume_url') if after else None})
audit.commit();r={'at':now,'cohort':sum(counts.values()),'counts':counts,'sites':sites,'remainingUnscheduled':[dict(r) for r in live.execute('SELECT site,count(*) n FROM forum_urls WHERE processed=0 AND next_at=0 AND resume_url IS NULL GROUP BY site')],'documents':[dict(r) for r in live.execute('SELECT export_state,count(*) n FROM forum_documents GROUP BY export_state')],'events':[dict(r) for r in live.execute('SELECT site,kind,count(*) n,max(at) latest FROM forum_events WHERE at>=? GROUP BY site,kind',(now-900000,))],'services':subprocess.check_output(['systemctl','show','forum-flow','forum-flow-writer','-p','Id,MainPID,ActiveState,NRestarts,MemoryCurrent'],text=True)}
(root/'cohort-watch.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));(root/'cohort-unattempted.json').write_text(json.dumps(details,ensure_ascii=False));

import csv,io,gzip,base64,hashlib
buffer=io.StringIO(newline='');fields=['site','native_id','url','classification','before_completed_at','completed_at','next_at','resume_url','last_page_num','target_last_page','scan_floor_page','reason'];writer=csv.DictWriter(buffer,fieldnames=fields);writer.writeheader()
for item in audit.execute('SELECT * FROM cohort ORDER BY site,native_id'):
 before=json.loads(item['before_json']);after=json.loads(item['last_observed']) if item['last_observed'] else {};after=after or {}
 writer.writerow({'site':item['site'],'native_id':item['native_id'],'url':after.get('url') or before.get('url'),'classification':item['status'],'before_completed_at':before.get('completed_at'),**{k:after.get(k) for k in fields[5:]}})
compressed=gzip.compress(buffer.getvalue().encode('utf-8-sig'));(root/'forum-url-results.csv.gz').write_bytes(compressed)
tests=subprocess.run(['/opt/forum-flow/node/bin/node','--test','test/forum-ready-fairness.test.mjs','test/forum-root-identity.test.mjs','test/forum-flow.test.mjs','test/forum-es5.test.mjs'],cwd='/opt/forum-flow/current',capture_output=True,text=True,timeout=90)
(root/'tests-final.txt').write_text(tests.stdout+'\n'+tests.stderr);r['tests']={'exitCode':tests.returncode,'output':tests.stdout,'stderr':tests.stderr};r['csvSha256']=hashlib.sha256(compressed).hexdigest();r['documentColumns']=[x['name'] for x in live.execute('PRAGMA table_info(forum_documents)')]
assert r['cohort']==5261
assert tests.returncode==0
(root/'QC-FORUM-RESULT.json').write_text(json.dumps(r,ensure_ascii=False,indent=2))
print(json.dumps({'summary':r,'csvGzipBase64':base64.b64encode(compressed).decode()},ensure_ascii=False))
