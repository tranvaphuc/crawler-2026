"""Read-only flow audit; diagnostic artifacts only, no service/config/data mutations."""
import datetime,json,os,pwd,re,sqlite3,subprocess,time
from pathlib import Path

news=Path('/opt/news-flow/current').exists();flow='news' if news else 'forum';now=int(time.time()*1000)
root=Path('/var/lib/'+flow+'-flow/stability-20261123');root.mkdir(exist_ok=True,mode=0o700)
units=['news-flow-seed','news-flow-parse','news-flow-import','news-flow-baomoi-original','news-discovery-health.timer'] if news else ['forum-flow','forum-flow-writer']
props='Id,LoadState,ActiveState,SubState,MainPID,NRestarts,ExecMainStatus,ExecMainStartTimestamp,MemoryCurrent,MemoryMax,CPUUsageNSec,CPUQuotaPerSecUSec,TasksCurrent,TasksMax'
raw=subprocess.run(['systemctl','show',*units,'-p',props],capture_output=True,text=True,timeout=15).stdout
services=[dict(line.split('=',1) for line in block.splitlines() if '=' in line) for block in raw.strip().split('\n\n')]
memory={m[1]:int(m[2])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if (m:=re.match(r'(\w+):\s+(\d+)',line))}
disk=subprocess.check_output(['df','-Pk','/var/lib'],text=True,timeout=10).strip().splitlines()[-1].split()
r={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'nowMs':now,'flow':flow,'release':str(Path('/opt/'+flow+'-flow/current').resolve()),'services':services,'resources':{'load':Path('/proc/loadavg').read_text().strip(),'cpuCount':os.cpu_count(),'cpuTicks':list(map(int,Path('/proc/stat').read_text().splitlines()[0].split()[1:9])),'memTotal':memory['MemTotal'],'memAvailable':memory['MemAvailable'],'swapUsed':memory['SwapTotal']-memory['SwapFree'],'diskAvailableBytes':int(disk[3])*1024,'diskUsedPercent':disk[4],'pressure':{k:Path('/proc/pressure/'+k).read_text().strip() for k in ['cpu','memory','io']}}}
dbfile='/var/lib/news-flow/news-flow-runtime/write.sqlite' if news else '/var/lib/forum-flow/runtime/state.sqlite'
db=sqlite3.connect('file:'+dbfile+'?mode=ro',uri=True,timeout=5);db.row_factory=sqlite3.Row;db.execute('PRAGMA query_only=ON')
def query(label,sql,args=()):
 deadline=time.monotonic()+15;db.set_progress_handler(lambda: int(time.monotonic()>deadline),20000)
 try:r[label]=[dict(x) for x in db.execute(sql,args)]
 except sqlite3.Error as e:r[label]={'error':getattr(e,'sqlite_errorname',type(e).__name__)}
 finally:db.set_progress_handler(None,0)
query('schema',"SELECT name,sql FROM sqlite_master WHERE type='table' AND name IN ('tasks','events','runner','outbox','article_links','import_receipts','forum_urls','forum_documents','forum_events','forum_seeds','forum_lease','forum_writer_lease','forum_es_bindings')")
if news:
 query('tasks','SELECT role,state,count(*) n,max(created) latest FROM tasks GROUP BY role,state')
 query('articles','SELECT parse_status,count(*) n,max(first_at) newest FROM article_links GROUP BY parse_status')
 query('seedStates','SELECT status,count(*) n,max(last_at) latest FROM seed_sources GROUP BY status')
 query('seedIssues',"SELECT site,status,reason,count(*) n,max(last_at) latest FROM seed_sources WHERE status!='ok' GROUP BY site,status,reason")
 query('outbox','SELECT state,reason,count(*) n,min(created) oldest,max(created) latest FROM outbox GROUP BY state,reason')
 query('receipts','SELECT status,count(*) n,max(imported_at) latest FROM import_receipts GROUP BY status')
 query('imports15m','SELECT status,count(*) n,min(imported_at) oldest,max(imported_at) latest FROM import_receipts WHERE imported_at>=? GROUP BY status',(now-900000,))
 query('events15m','SELECT kind,count(*) n,max(at) latest FROM events WHERE at>=? GROUP BY kind',(now-900000,))
 query('recentEvents','SELECT id,at,kind,site,url FROM events ORDER BY id DESC LIMIT 12')
 query('heldReasons15m',"SELECT reason,count(*) n,max(created) latest FROM tasks WHERE state='held' AND created>=? GROUP BY reason ORDER BY n DESC LIMIT 30",(now-900000,))
 query('oldRunning',"SELECT role,site,count(*) n,min(created) oldest,max(lease_until) lease_until FROM tasks WHERE state='running' GROUP BY role,site ORDER BY oldest LIMIT 8")
 query('leases','SELECT * FROM runner')
 query('aiUsage','SELECT * FROM ai_usage ORDER BY day')
 query('reviews15m','SELECT role,status,reason,count(*) n,max(at) latest FROM ai_reviews WHERE at>=? GROUP BY role,status,reason',(now-900000,))
 ai=Path('/etc/news-flow/ai.env').read_text();r['aiPolicy']={k:v.strip('"\'') for line in ai.splitlines() if '=' in line for k,v in [line.split('=',1)] if k in ['NEWS_AI_MODEL','AI_DAILY_MAX_CALLS','AI_DAILY_BUDGET_USD']}
 health=Path('/var/lib/news-flow/discovery-health/latest.json');r['discoveryHealth']=json.loads(health.read_text()) if health.exists() else None
 files=[Path('/var/lib/news-flow/news-flow-runtime')/p for p in ['seed-report.json','article-report.json','writer-report.json']]
else:
 query('documents','SELECT site,role,export_state,export_reason,count(*) n FROM forum_documents GROUP BY site,role,export_state,export_reason')
 query('urls','SELECT site,processed,reason,count(*) n,max(completed_at) completed_at,max(seen) seen FROM forum_urls GROUP BY site,processed,reason')
 query('readyBySite','SELECT site,count(*) n,min(next_at) oldest,min(seen) oldestSeen FROM forum_urls WHERE processed=0 AND next_at<=? GROUP BY site',(now,))
 query('seeds','SELECT site,status,reason,count(*) n,min(next_at) next_at FROM forum_seeds GROUP BY site,status,reason')
 query('events15m','SELECT kind,site,count(*) n,max(at) latest FROM forum_events WHERE at>=? GROUP BY kind,site',(now-900000,))
 query('eventsHour','SELECT kind,site,count(*) n,max(at) latest FROM forum_events WHERE at>=? GROUP BY kind,site',(now-3600000,))
 query('recentEvents','SELECT id,at,kind,site,url FROM forum_events ORDER BY id DESC LIMIT 12')
 query('leases','SELECT * FROM forum_lease')
 query('writerLeases','SELECT * FROM forum_writer_lease')
 query('bindingCounts','SELECT role,count(*) n FROM forum_es_bindings GROUP BY role')
 files=[Path('/var/lib/forum-flow/runtime')/p for p in ['writer-report.json','report.json','summary.json','coverage.json']]
db.close()
r['reports']=[]
for p in files:
 if not p.exists():continue
 try:
  v=json.loads(p.read_text());entry={'path':str(p),'mtime':p.stat().st_mtime,'keys':list(v) if isinstance(v,dict) else None}
  if isinstance(v,dict):
   entry.update({k:v[k] for k in ['checkedAt','at','elapsedMs','memory','write','cycle','processed','counts','pending','running','completed','errors'] if k in v and (not isinstance(v[k],(list,dict)) or k in ['memory','counts'])})
   if isinstance(v.get('results'),list):
    entry['resultCounts']={}
    for item in v['results']:
     k=str(item.get('status'));entry['resultCounts'][k]=entry['resultCounts'].get(k,0)+1
  r['reports'].append(entry)
 except (ValueError,OSError):r['reports'].append({'path':str(p),'error':'UNREADABLE_REPORT'})
r['journal']=[]
for unit in units:
 lines=subprocess.run(['journalctl','-u',unit,'--since','1 hour ago','-n','12000','-o','json','--no-pager'],capture_output=True,text=True,timeout=20).stdout.splitlines();counts={};last=[];codes={}
 for line in lines:
  try:row=json.loads(line);msg=row.get('MESSAGE','')
  except ValueError:continue
  if not isinstance(msg,str):continue
  for code in set(re.findall(r'SQLITE_[A-Z_]+|ENOSPC|ENOMEM|ERR_[A-Z_]+|FORUM_[A-Z_]+|NEWS_[A-Z_]+',msg)):codes[code]=codes.get(code,0)+1
  try:
   v=json.loads(msg)
   if not isinstance(v,dict):continue
   status=str(v.get('status',v.get('kind','counts' if 'counts' in v else 'event')));counts[status]=counts.get(status,0)+1
   allowed={k:v[k] for k in ['at','checkedAt','status','kind','reason','error','code','counts','role','site','elapsedMs','exitCode','sqliteCode','write','completed','verified','created','existing','held'] if k in v}
   last.append(allowed)
  except ValueError:pass
 r['journal'].append({'unit':unit,'sampledLines':len(lines),'statusCounts':counts,'errorCodes':codes,'last':last[-3:]})
kernel=subprocess.run(['journalctl','-k','--since','1 hour ago','-o','cat','--no-pager'],capture_output=True,text=True,timeout=10).stdout
r['kernelAlerts']={key:len(re.findall(pattern,kernel,re.I)) for key,pattern in [('oom','out of memory|oom-kill|killed process'),('ioError','I/O error|EXT4-fs error|read-only file system')]}
r['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();sample=len(list(root.glob('sample-*.json')))+1;out=root/('sample-%02d.json'%sample);out.write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8');out.chmod(0o600)
if news:
 account=pwd.getpwnam(os.environ['SUDO_USER']);dest=Path(account.pw_dir)/'.qc-stability-news-latest.json';dest.write_bytes(out.read_bytes());os.chown(dest,account.pw_uid,account.pw_gid);dest.chmod(0o600)
print(json.dumps(r,ensure_ascii=False))
