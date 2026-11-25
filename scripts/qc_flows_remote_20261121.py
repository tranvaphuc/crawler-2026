"""Read-only production QC snapshot. Never output environment or credentials."""
import datetime, json, sqlite3, subprocess, time
from pathlib import Path

now = int(time.time() * 1000)
out = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
units = ['news-flow-seed', 'news-flow-parse', 'news-flow-import', 'news-flow-writer', 'news-flow-baomoi-original', 'news-discovery-health.timer'] if Path('/opt/news-flow/current').exists() else ['forum-flow', 'forum-flow-writer']
out['services'] = subprocess.run(['systemctl', 'show', *units, '-p', 'Id,ActiveState,SubState,MainPID,NRestarts,ExecMainStatus,MemoryCurrent,ExecMainStartTimestamp,Restart'], capture_output=True, text=True).stdout
out['resources'] = {'disk': subprocess.run(['df','-h','/var/lib'],capture_output=True,text=True).stdout, 'load':Path('/proc/loadavg').read_text().strip()}
is_news = units[0].startswith('news')
root = Path('/var/lib/news-flow' if is_news else '/var/lib/forum-flow')
out['release'] = str(Path('/opt/news-flow/current' if is_news else '/opt/forum-flow/current').resolve())
out['reports'] = []
for p in root.rglob('*.json'):
 if p.name in ['seed-report.json','article-report.json','writer-report.json','latest.json','report.json'] or 'report' in p.name:
  if p.stat().st_mtime > time.time()-86400:
   try:
    data=json.loads(p.read_text())
    out['reports'].append({'path':str(p),'mtime':p.stat().st_mtime,'keys':list(data) if isinstance(data,dict) else None})
   except Exception: pass
out['reports'] = sorted(out['reports'], key=lambda x:x['mtime'], reverse=True)[:8]
dbpath=root/('news-flow-runtime/write.sqlite' if is_news else 'runtime/state.sqlite')
db=sqlite3.connect('file:'+str(dbpath)+'?mode=ro',uri=True,timeout=20);db.row_factory=sqlite3.Row
out['tables']=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")]
def query(label,sql,args=()):
 try:out[label]=[dict(r) for r in db.execute(sql,args)]
 except Exception as e:out[label]={'error':str(e)}
if is_news:
 query('ai_usage','SELECT * FROM ai_usage ORDER BY day DESC LIMIT 5')
 query('seeds','SELECT status,reason,count(*) n,max(last_at) latest FROM seed_sources GROUP BY status,reason ORDER BY n DESC LIMIT 30')
 query('articles','SELECT parse_status,error,count(*) n,max(first_at) latest FROM article_links GROUP BY parse_status,error ORDER BY n DESC LIMIT 35')
 query('outbox','SELECT state,reason,count(*) n FROM outbox GROUP BY state,reason ORDER BY n DESC LIMIT 25')
 query('receipts','SELECT status,count(*) n,max(imported_at) latest FROM import_receipts GROUP BY status')
 query('schema',"SELECT name,sql FROM sqlite_master WHERE type='table' AND name IN ('events','runner','tasks','ai_reviews')")
 env=Path('/etc/news-flow/ai.env')
 out['ai_config']={k:v.strip('"\'') for k,v in [line.split('=',1) for line in env.read_text().splitlines() if '=' in line] if k in ['NEWS_AI_ENABLED','NEWS_AI_MODEL','AI_DAILY_BUDGET_USD','AI_DAILY_MAX_CALLS']}
 query('reviews','SELECT role,status,reason,count(*) n,max(at) latest FROM ai_reviews GROUP BY role,status,reason ORDER BY latest DESC LIMIT 20')
else:
 query('documents','SELECT site,role,export_state,export_reason,count(*) n FROM forum_documents GROUP BY site,role,export_state,export_reason')
 query('urls','SELECT site,processed,reason,count(*) n,max(completed_at) latest,max(seen) seen FROM forum_urls GROUP BY site,processed,reason')
 query('seeds','SELECT site,status,reason,count(*) n,max(next_at) next_at FROM forum_seeds GROUP BY site,status,reason')
 query('events','SELECT kind,site,count(*) n,max(at) latest FROM forum_events WHERE at>? GROUP BY kind,site ORDER BY latest DESC',(now-3600000,))
 query('recent_events','SELECT * FROM forum_events ORDER BY id DESC LIMIT 10')
 query('leases','SELECT * FROM forum_lease')
 query('writer_leases','SELECT * FROM forum_writer_lease')
db.close()
# Only parse JSON journal messages, excluding arbitrary exception text and environment dumps.
out['journal']=[]
for unit in units:
 lines=subprocess.run(['journalctl','-u',unit,'--since','30 minutes ago','-n','80','--output=cat','--no-pager'],capture_output=True,text=True).stdout.splitlines()
 parsed=[]
 for line in lines:
  try:
   v=json.loads(line)
   if isinstance(v,dict):
    if 'discoveryHealth' in v:
     h=v['discoveryHealth'];v={**v,'discoveryHealth':{k:h.get(k) for k in ['checkedAt','totalSites','alertSites','counts']}}
    parsed.append(v)
  except Exception:pass
 out['journal'].append({'unit':unit,'messages':parsed[-3:]})
print(json.dumps(out,ensure_ascii=False,indent=2))
