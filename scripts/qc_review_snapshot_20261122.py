"""Capture the unresolved QC cohort without dumping article bodies to logs."""
import datetime,json,sqlite3,subprocess,os,pwd,shutil,hashlib
from pathlib import Path
news=Path('/opt/news-flow/current').exists()
flow='news' if news else 'forum'
root=Path('/var/lib/'+flow+'-flow/qc-20261122');root.mkdir(exist_ok=True,mode=0o700)
db=sqlite3.connect('file:/var/lib/'+flow+'-flow/'+('news-flow-runtime/write.sqlite' if news else 'runtime/state.sqlite')+'?mode=ro',uri=True,timeout=30);db.row_factory=sqlite3.Row
def rows(sql,args=()):return [dict(r) for r in db.execute(sql,args)]
data={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'flow':flow,'release':str(Path('/opt/'+flow+'-flow/current').resolve())}
if news:
 data['health']=json.loads(Path('/var/lib/news-flow/discovery-health/latest.json').read_text())
 data['held']=rows("SELECT * FROM outbox WHERE state='held'")
 data['ai_usage']=rows('SELECT * FROM ai_usage ORDER BY day')
 data['aiConfigHash']=hashlib.sha256(Path('/etc/news-flow/ai.env').read_bytes()).hexdigest()
 data['aiConfig']={k:v.strip('"\'') for k,v in [s.split('=',1) for s in Path('/etc/news-flow/ai.env').read_text().splitlines() if '=' in s] if k in ['NEWS_AI_MODEL','AI_DAILY_MAX_CALLS','AI_DAILY_BUDGET_USD']}
 data['seedRecovery']=json.loads(Path('/var/lib/news-flow/qc-20261121/seed-recovery.json').read_text())
 data['seedFollowup']=[]
 for r in data['seedRecovery']['restored']:
  data['seedFollowup']+=rows('SELECT * FROM seed_sources WHERE url=?',(r['url'],))
else:
 data['held']=rows("SELECT * FROM forum_documents WHERE export_state='held'")
 data['bindings']=rows("SELECT * FROM forum_es_bindings WHERE role='forumTopic'")
 data['reconciliations']=rows('SELECT * FROM forum_parent_reconciliations')
 data['counts']=rows('SELECT export_state,export_reason,count(*) n FROM forum_documents GROUP BY export_state,export_reason')
data['services']=subprocess.check_output(['systemctl','show',*(['news-flow-seed','news-flow-parse','news-flow-import'] if news else ['forum-flow','forum-flow-writer']),'-p','Id,MainPID,ActiveState,NRestarts'],text=True)
out=root/'baseline.json';out.write_text(json.dumps(data,ensure_ascii=False,indent=2));out.chmod(0o600)
account=pwd.getpwnam(os.environ['SUDO_USER']);dest=Path(account.pw_dir)/('.qc-'+flow+'-baseline-20261122.json');shutil.copyfile(out,dest);os.chown(dest,account.pw_uid,account.pw_gid);dest.chmod(0o600)
print(json.dumps({'flow':flow,'at':data['at'],'held':len(data['held']),'sourceAlerts':data.get('health',{}).get('alertSites'),'aiConfig':data.get('aiConfig'),'download':dest.name,'counts':data.get('counts')}))
