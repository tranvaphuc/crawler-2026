"""Read-only VPS metrics; retain local snapshots for measured per-minute deltas."""
from pathlib import Path
import sys,json,shlex,datetime
sys.path.insert(0,str(Path('.cache/forum-deploy-python').resolve()))
import paramiko
from dotenv import dotenv_values
out=Path('outputs/forum-progress');out.mkdir(parents=True,exist_ok=True)
latest=out/'latest.json';previous=json.loads(latest.read_text(encoding='utf-8')) if latest.exists() else None
env=dotenv_values('../cms-2026/.env');assert env['SSH_HOST']=='148.113.144.41'
cutoff=int(previous['atMs']) if previous else 0
client=paramiko.SSHClient();client.load_system_host_keys();client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
 client.connect(env['SSH_HOST'],username=env['SSH_USER'],password=env['SSH_PASS'],timeout=15,allow_agent=False,look_for_keys=False)
 code=r'''
import json,sqlite3,subprocess,time,datetime,re
from pathlib import Path
now=int(time.time()*1000);cutoff=CUTOFF_MS or now-900000
db=sqlite3.connect('file:/var/lib/forum-flow/runtime/state.sqlite?mode=ro',uri=True);db.row_factory=sqlite3.Row;db.execute('BEGIN')
rows=lambda sql,args=():[dict(r) for r in db.execute(sql,args)]
docs=rows('SELECT role,COUNT(*) n FROM forum_documents GROUP BY role');exports=rows('SELECT export_state,COUNT(*) n FROM forum_documents GROUP BY export_state')
totals={r['role']:r['n'] for r in docs};states={r['export_state']:r['n'] for r in exports}
per_site=rows('SELECT site,role,COUNT(*) n FROM forum_documents GROUP BY site,role')
counts={'topics':totals.get('forumTopic',0),'replies':totals.get('forumComment',0),'esCreated':states.get('created',0),'esExisting':states.get('existing',0),'exportPending':states.get('pending',0),'exportHeld':states.get('held',0),'outsideWindow':states.get('outside_window',0),'urlsTotal':db.execute('SELECT COUNT(*) FROM forum_urls').fetchone()[0],'urlsPending':db.execute('SELECT COUNT(*) FROM forum_urls WHERE processed=0').fetchone()[0]}
events=rows('SELECT kind,COUNT(*) n FROM forum_events WHERE at>? AND at<=? GROUP BY kind',(cutoff,now))
failures=rows("SELECT site,json_extract(details,'$.reason') reason,COUNT(*) n FROM forum_events WHERE at>? AND at<=? AND kind IN ('seed_failed','topic_failed') GROUP BY site,reason ORDER BY n DESC LIMIT 5",(cutoff,now))
time_errors=[];checked=0
local=datetime.timezone(datetime.timedelta(hours=7))
months={'một':1,'hai':2,'ba':3,'tư':4,'bốn':4,'năm':5,'sáu':6,'bảy':7,'tám':8,'chín':9,'mười':10,'mười một':11,'mười hai':12}
thai=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
def stamp(v):return datetime.datetime.fromisoformat(re.sub(r'([+-]\d{2})(\d{2})$',r'\1:\2',v.replace('Z','+00:00'))).timestamp()
def raw_time(t):
 raw=' '.join(t['raw'].split());kind=t['kind']
 if kind in ('seconds','milliseconds'):return float(raw)/(1000 if kind=='milliseconds' else 1)
 if kind=='iso':return stamp(raw)
 if kind=='thai':
  m=re.fullmatch(r'(\d{1,2}) (\S+) (\d{4}) เวลา (\d{1,2}):(\d{2})(?::(\d{2}))? น\.?',raw)
  if not m:raise ValueError('unsupported_thai_clock')
  d,mo,y,h,mi,s=m.groups();return datetime.datetime(int(y)-543,thai.index(mo)+1,int(d),int(h),int(mi),int(s or 0),tzinfo=local).timestamp()
 raw=re.sub(r'\s+(lúc|at)\s+',' ',raw,flags=re.I)
 raw=re.sub(r'\s+Tháng\s+(mười một|mười hai|một|hai|ba|tư|bốn|năm|sáu|bảy|tám|chín|mười|\d{1,2})\s+',lambda m:'/'+str(months.get(m[1].lower(),int(m[1]) if m[1].isdigit() else 0))+'/',raw,flags=re.I)
 for fmt in ['%d/%m/%Y %H:%M:%S','%d/%m/%Y %H:%M','%d/%m/%y %H:%M:%S','%d/%m/%y %H:%M','%H:%M %d/%m/%Y','%Y-%m-%d %H:%M:%S','%Y-%m-%dT%H:%M:%S','%d/%m/%Y %I:%M %p']:
  try:return datetime.datetime.strptime(raw,fmt).replace(tzinfo=local).timestamp()
  except ValueError:pass
 raise ValueError('unsupported_absolute_clock')
for r in db.execute('SELECT site,role,native_id,thread_id,doc,proof FROM forum_documents ORDER BY rowid DESC LIMIT 100'):
 checked+=1
 try:
  doc=json.loads(r['doc']);p=doc['_source'];proof=json.loads(r['proof']);date=stamp(p['publishedDate']);assert abs(date-raw_time(proof['time']))<0.001,'raw_time_mismatch'
  y,w,_=datetime.datetime.fromtimestamp(date,local).isocalendar();assert doc['_index']==f'master{y}{w:02d}','week_mismatch'
  if r['role']=='forumComment':
   parent=db.execute("SELECT doc FROM forum_documents WHERE site=? AND role='forumTopic' AND thread_id=?",(r['site'],r['thread_id'])).fetchone();parent=json.loads(parent[0]);assert p['parentId']==parent['_id'] and p['parentDate']==parent['_source']['publishedDate'],'parent_mismatch'
 except Exception as e:time_errors.append({'site':r['site'],'id':r['native_id'],'reason':str(e)})
db.close();services={}
for name in ['forum-flow.service','forum-flow-writer.service']:
 text=subprocess.run(['systemctl','show',name,'--property=ActiveState,SubState,MainPID,NRestarts,MemoryCurrent,CPUUsageNSec'],capture_output=True,text=True,check=True).stdout
 services[name]=dict(line.split('=',1) for line in text.splitlines() if '=' in line)
print(json.dumps({'atMs':now,'server':'148.113.144.41','counts':counts,'perSite':per_site,'services':services,'windowEvents':events,'topFailures':failures,'timeAudit':{'checked':checked,'errors':time_errors}}))
'''.replace('CUTOFF_MS',str(cutoff))
 stdin,stdout,stderr=client.exec_command('sudo -S -p "" python3 -c '+shlex.quote(code),timeout=60);stdin.write(env['SSH_PASS']+'\n');stdin.flush();stdin.channel.shutdown_write();output=stdout.read().decode();status=stdout.channel.recv_exit_status()
 if status:raise RuntimeError('Read-only forum metrics failed: '+stderr.read().decode()[:700])
 snapshot=json.loads(output);now=datetime.datetime.fromtimestamp(snapshot['atMs']/1000,datetime.timezone.utc);delta=None
 if previous:
  seconds=(snapshot['atMs']-previous['atMs'])/1000
  if seconds<=0:raise RuntimeError('Invalid snapshot interval')
  values={k:snapshot['counts'][k]-previous['counts'].get(k,0) for k in ['topics','replies','esCreated','esExisting','exportPending','exportHeld','urlsPending']}
  resets=[k for k in ['topics','replies','esCreated'] if values[k]<0]
  delta={'elapsedSeconds':seconds,'new':values,'perMinute':{k:round(values[k]*60/seconds,2) for k in ['topics','replies','esCreated','esExisting']} if not resets else None,'counterReset':resets,'pidChanged':[n for n,s in snapshot['services'].items() if s['MainPID']!=previous['services'].get(n,{}).get('MainPID')]}
 snapshot['delta']=delta
 filename=out/(now.strftime('%Y%m%dT%H%M%SZ')+'.json');filename.write_text(json.dumps(snapshot,indent=2,ensure_ascii=False),encoding='utf-8')
 temp=out/'latest.tmp';temp.write_text(json.dumps(snapshot,indent=2,ensure_ascii=False),encoding='utf-8');temp.replace(latest)
 brief={k:snapshot[k] for k in ['server','counts','services','delta','windowEvents','topFailures','timeAudit']};brief['atUtcPlus7']=(now+datetime.timedelta(hours=7)).strftime('%d/%m/%Y %H:%M:%S UTC+07');brief['sourcesWithData']=len({r['site'] for r in snapshot['perSite']});brief['snapshotFile']=str(filename.resolve());print(json.dumps(brief,ensure_ascii=False))
finally:client.close()
