from pathlib import Path
import sys,json,shlex
sys.path.insert(0,str(Path('.cache/forum-deploy-python').resolve()))
import paramiko
from dotenv import dotenv_values
target_mode='--news-server' not in sys.argv;env=dotenv_values('../cms-2026/.env' if target_mode else '../social-trend/.env');client=paramiko.SSHClient();client.load_system_host_keys();client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
 client.connect(env['SSH_HOST'],username=env['SSH_USER'],password=env['SSH_PASS'],timeout=15,allow_agent=False,look_for_keys=False)
 code=r'''
import json,sqlite3,subprocess,re,datetime,os,hashlib
from pathlib import Path
units=['forum-flow.service','forum-flow-writer.service']+(['news-flow-seed.service','news-flow-parse.service','news-flow-import.service'] if Path('/opt/news-flow/current').exists() else [])
services={name:subprocess.run(['systemctl','show',name,'--property=ActiveState,SubState,MainPID,NRestarts,CPUUsageNSec,MemoryCurrent,ExecMainStartTimestampMonotonic'],capture_output=True,text=True,check=True).stdout for name in units}
enabled={name:subprocess.run(['systemctl','is-enabled',name],capture_output=True,text=True).stdout.strip() for name in units[:2]}
db=sqlite3.connect('file:/var/lib/forum-flow/runtime/state.sqlite?mode=ro',uri=True);db.row_factory=sqlite3.Row
rows=db.execute('SELECT * FROM forum_documents').fetchall();errors=[];cross_checks=0
utc=datetime.timezone.utc;local=datetime.timezone(datetime.timedelta(hours=7))
months={'một':1,'hai':2,'ba':3,'tư':4,'bốn':4,'năm':5,'sáu':6,'bảy':7,'tám':8,'chín':9,'mười':10,'mười một':11,'mười hai':12}
thai=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
def instant(value):return datetime.datetime.fromisoformat(re.sub(r'([+-]\d{2})(\d{2})$',r'\1:\2',value.replace('Z','+00:00'))).timestamp()
def replay(proof):
 raw=' '.join(proof['raw'].split());kind=proof['kind']
 if kind in ('seconds','milliseconds'):return float(raw)/(1000 if kind=='milliseconds' else 1)
 if kind=='iso':return instant(raw)
 if kind=='thai':
  m=re.fullmatch(r'(\d{1,2}) (\S+) (\d{4}) เวลา (\d{1,2}):(\d{2})(?::(\d{2}))? น\.?',raw)
  if not m:raise ValueError('unsupported_thai_clock')
  day,month,year,hour,minute,second=m.groups();return datetime.datetime(int(year)-543,thai.index(month)+1,int(day),int(hour),int(minute),int(second or 0),tzinfo=local).timestamp()
 raw=re.sub(r'\s+(lúc|at)\s+',' ',raw,flags=re.I)
 raw=re.sub(r'\s+Tháng\s+(mười một|mười hai|một|hai|ba|tư|bốn|năm|sáu|bảy|tám|chín|mười|\d{1,2})\s+',lambda m:'/'+str(months.get(m[1].lower(),int(m[1]) if m[1].isdigit() else 0))+'/',raw,flags=re.I)
 for fmt in ['%d/%m/%Y %H:%M:%S','%d/%m/%Y %H:%M','%d/%m/%y %H:%M:%S','%d/%m/%y %H:%M','%H:%M %d/%m/%Y','%Y-%m-%d %H:%M:%S','%Y-%m-%dT%H:%M:%S','%d/%m/%Y %I:%M %p']:
  try:return datetime.datetime.strptime(raw,fmt).replace(tzinfo=local).timestamp()
  except ValueError:pass
 raise ValueError('unsupported_absolute_clock')
parents={(r['site'],r['thread_id']):json.loads(r['doc']) for r in rows if r['role']=='forumTopic'}
for row in rows:
 try:
  doc=json.loads(row['doc']);proof=json.loads(row['proof']);p=doc['_source'];date=instant(p['publishedDate'])
  assert abs(date-replay(proof['time']))<0.001,'raw_time_mismatch'
  for check in proof['time'].get('crossChecks',[]):
   unit=60 if 'minute' in (proof['time']['precision'],check['precision']) else 1
   assert int(date//unit)==int(replay(check)//unit),'cross_check_mismatch'
  if proof['time'].get('crossChecks'):cross_checks+=1
  year,week,_=datetime.datetime.fromtimestamp(date,local).isocalendar();assert doc['_index']==f'master{year}{week:02d}','week_mismatch'
  assert Path(proof['evidence']['evidenceFile']).is_file(),'missing_evidence'
  if row['role']=='forumComment':
   parent=parents[(row['site'],row['thread_id'])];assert p['parentId']==parent['_id'] and p['parentDate']==parent['_source']['publishedDate'],'parent_mismatch'
 except Exception as e:errors.append({'site':row['site'],'id':row['native_id'],'reason':str(e)})
counts=lambda sql:[dict(r) for r in db.execute(sql).fetchall()]
result={'checkedAt':datetime.datetime.now(utc).isoformat(),'services':services,'enabled':enabled,'documents':len(rows),'crossCheckedClocks':cross_checks,'timeAndParentErrors':errors,'perSite':counts('SELECT site,role,COUNT(*) count FROM forum_documents GROUP BY site,role'),'exports':counts('SELECT export_state,export_reason,COUNT(*) count FROM forum_documents GROUP BY export_state,export_reason'),'urlErrors':counts('SELECT site,reason,COUNT(*) count FROM forum_urls WHERE reason IS NOT NULL GROUP BY site,reason'),'seedErrors':counts("SELECT site,status,reason,COUNT(*) count FROM forum_seeds WHERE status='failed' GROUP BY site,status,reason"),'aiEnvHash':hashlib.sha256(Path('/etc/news-flow/ai.env').read_bytes()).hexdigest() if Path('/etc/news-flow/ai.env').exists() else None,'newsRelease':os.path.realpath('/opt/news-flow/current') if Path('/opt/news-flow/current').exists() else None}
samples=[]
for role in ['forumTopic','forumComment']:
 for row in db.execute("SELECT * FROM forum_documents WHERE role=? AND export_state IN ('created','existing') LIMIT 2",(role,)):
  native=row['thread_id'] if role=='forumTopic' else row['native_id'];bound=db.execute('SELECT * FROM forum_es_bindings WHERE site=? AND role=? AND native_id=?',(row['site'],role,native)).fetchone()
  if bound:
   parent=db.execute("SELECT * FROM forum_es_bindings WHERE site=? AND role='forumTopic' AND native_id=?",(row['site'],row['thread_id'])).fetchone()
   samples.append({'site':row['site'],'role':role,'index':bound['es_index'],'id':bound['es_id'],'doc':json.loads(row['doc']),'proof':json.loads(row['proof']),'boundDate':bound['published'],'expectedParentId':parent['es_id'] if parent else None,'expectedParentDate':parent['published'] if parent else None})
js="""const fs=require('fs');const dotenv=require('/opt/forum-flow/current/node_modules/dotenv');const ES=require('/opt/forum-flow/current/node_modules/elasticsearch');const env=dotenv.parse(fs.readFileSync('/etc/forum-flow/forum.env'));const es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',log:[],maxRetries:0,requestTimeout:30000});const samples=SAMPLES; (async()=>{try{const out=[];for(const p of samples){const h=await es.get({index:p.index,type:p.role,id:p.id});const unit=p.proof.time.precision==='minute'?60000:1000;out.push({site:p.site,role:p.role,found:h.found,timeMatches:Math.floor(Date.parse(h._source.publishedDate)/unit)===Math.floor(Date.parse(p.doc._source.publishedDate)/unit),parentMatches:p.role==='forumTopic'||h._source.parentDate===p.expectedParentDate&&h._source.parentId===p.expectedParentId,publishedDate:h._source.publishedDate,parentDate:h._source.parentDate||null});}console.log(JSON.stringify(out));}catch(e){console.log(JSON.stringify({error:e.body?.error?.type||e.name,status:e.statusCode,code:e.code,displayName:e.displayName}));process.exitCode=1;}finally{es.close();}})();""".replace('SAMPLES',json.dumps(samples,ensure_ascii=False))
node='/opt/forum-flow/node/bin/node' if Path('/opt/forum-flow/node/bin/node').exists() else '/opt/news-flow/node/bin/node'
readback=subprocess.run(['runuser','-u','forum-flow','--',node,'-e',js],capture_output=True,text=True,timeout=120)
result['esReadback']=json.loads(readback.stdout) if readback.stdout else {'error':'missing_readback'}
db.close();print(json.dumps(result,ensure_ascii=False))
'''
 stdin,stdout,stderr=client.exec_command('sudo -S -p "" python3 -c '+shlex.quote(code),timeout=180);stdin.write(env['SSH_PASS']+'\n');stdin.flush();stdin.channel.shutdown_write();output=stdout.read().decode();error=stderr.read().decode();status=stdout.channel.recv_exit_status()
 out=Path('outputs/forum-move-2026-11-17' if target_mode else 'outputs/forum-deploy-2026-11-17');out.mkdir(parents=True,exist_ok=True);(out/'health-result.json').write_text(output,encoding='utf-8')
 if output:
  result=json.loads(output);brief={k:result[k] for k in ['checkedAt','services','enabled','documents','crossCheckedClocks','exports','urlErrors','seedErrors','esReadback']};brief['timeAndParentErrorCount']=len(result['timeAndParentErrors']);brief['timeAndParentErrors']=result['timeAndParentErrors'][:4];print(json.dumps(brief,ensure_ascii=False))
 print(json.dumps({'exit':status,'error':error[:1200]}));assert status==0,'Forum deployment check failed'
finally:client.close()
