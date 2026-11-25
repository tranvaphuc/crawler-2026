import datetime,json,sqlite3,subprocess,os,pwd,shutil
from pathlib import Path
news=Path('/opt/news-flow/current').exists();flow='news' if news else 'forum';root=Path('/var/lib/'+flow+'-flow/qc-20261122')
db=sqlite3.connect('file:/var/lib/'+flow+'-flow/'+('news-flow-runtime/write.sqlite' if news else 'runtime/state.sqlite')+'?mode=ro',uri=True,timeout=30);db.row_factory=sqlite3.Row
def rows(sql,args=()):return [dict(r) for r in db.execute(sql,args)]
out={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'flow':flow,'services':subprocess.check_output(['systemctl','show',*(['news-flow-seed','news-flow-parse','news-flow-import'] if news else ['forum-flow','forum-flow-writer']),'-p','Id,MainPID,ActiveState,NRestarts'],text=True)}
if news:
 subprocess.run(['systemctl','start','news-discovery-health.service'],check=True)
 baseline=json.loads((root/'baseline.json').read_text());health=json.loads(Path('/var/lib/news-flow/discovery-health/latest.json').read_text());cohort=json.loads((root/'cohort.json').read_text())
 out['outbox']=rows('SELECT state,reason,count(*) n FROM outbox GROUP BY state,reason')
 ids=[r['id'] for r in baseline['held']];out['original8Receipts']=rows('SELECT id,status,es_id,es_index FROM import_receipts WHERE id IN ('+','.join('?' for _ in ids)+')',ids)
 out['aiUsage']=rows('SELECT * FROM ai_usage ORDER BY day');out['aiLedgerUnchanged']=out['aiUsage']==baseline['ai_usage']
 out['health']={k:health[k] for k in ['checkedAt','totalSites','alertSites','counts']};alerts={r['site']:r for r in health['sites']};out['original39']=[{'site':site,'alerts':alerts.get(site,{}).get('alerts',[])} for site in cohort]
 recovery=json.loads((root/'verified-recovery.json').read_text());out['seedRecovery']=recovery
 out['seedFollowup']=[]
 for seed in recovery['restoredSeeds']:out['seedFollowup']+=rows('SELECT site,url,status,reason,last_at,links_found,new_links FROM seed_sources WHERE url=?',(seed['url'],))
 out['importResolution']=json.loads((root/'news-import-resolution.json').read_text())
else:
 out['counts']=rows('SELECT export_state,export_reason,count(*) n FROM forum_documents GROUP BY export_state,export_reason')
 out['held']=rows("SELECT site,role,native_id,thread_id,export_reason FROM forum_documents WHERE export_state='held'")
 out['original288']=[]
 prior=sqlite3.connect('file:/var/backups/forum-flow/qc-20261121-1795279708/state.sqlite?mode=ro',uri=True);prior.row_factory=sqlite3.Row
 for r in prior.execute("SELECT site,role,native_id FROM forum_documents WHERE export_state='held'"):
  current=db.execute('SELECT export_state,export_reason FROM forum_documents WHERE site=? AND role=? AND native_id=?',(r['site'],r['role'],r['native_id'])).fetchone();out['original288'].append({**dict(r),**dict(current)})
 prior.close();out['parentApply']=json.loads((root/'forum-apply.json').read_text())
 out['pending']=rows("SELECT role,count(*) n FROM forum_documents WHERE export_state='pending' GROUP BY role")
db.close();p=root/'verification.json';p.write_text(json.dumps(out,ensure_ascii=False,indent=2));p.chmod(0o600)
account=pwd.getpwnam(os.environ['SUDO_USER']);dest=Path(account.pw_dir)/('.qc-'+flow+'-verify-20261122.json');shutil.copyfile(p,dest);os.chown(dest,account.pw_uid,account.pw_gid);dest.chmod(0o600)
print(json.dumps({'flow':flow,'at':out['at'],'outbox':out.get('outbox'),'original8Receipts':len(out.get('original8Receipts',[])),'aiLedgerUnchanged':out.get('aiLedgerUnchanged'),'health':out.get('health'),'original39Alerting':sum(bool(r['alerts']) for r in out.get('original39',[])),'forumOriginalHeld':len(out.get('original288',[])),'forumOriginalUnresolved':sum(r['export_state'] not in ['created','existing','outside_window','context_only'] for r in out.get('original288',[])),'newHeldCount':len(out.get('held',[])),'heldSample':out.get('held',[])[:8]}))
