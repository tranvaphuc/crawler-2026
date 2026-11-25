"""Read-only baseline for the complete repair cohort."""
import collections,datetime,hashlib,json,os,sqlite3,subprocess,time
from pathlib import Path
news=Path('/opt/news-flow/current').exists();flow='news' if news else 'forum';root=Path('/var/lib/'+flow+'-flow/repair-all-20261125');root.mkdir(exist_ok=True,mode=0o700)
db=sqlite3.connect('file:'+('/var/lib/news-flow/news-flow-runtime/write.sqlite' if news else '/var/lib/forum-flow/runtime/state.sqlite')+'?mode=ro',uri=True,timeout=30);db.row_factory=sqlite3.Row
def rows(sql,args=()):return [dict(x) for x in db.execute(sql,args)]
r={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'flow':flow,'release':str(Path('/opt/'+flow+'-flow/current').resolve()),'schema':rows("SELECT name,sql FROM sqlite_master WHERE type='table'"),'files':{}}
for file in Path('/opt/'+flow+'-flow/current/src/'+('newsFlow' if news else 'forumFlow')).glob('*.mjs'):r['files'][file.name]=hashlib.sha256(file.read_bytes()).hexdigest()
if news:
 r['articleReasons']=rows("SELECT error,count(*) n FROM article_links WHERE parse_status='fail' GROUP BY error ORDER BY n DESC")
 r['articleSites']=rows("SELECT site,count(*) n FROM article_links WHERE parse_status='fail' GROUP BY site ORDER BY n DESC")
 r['seedReasons']=rows("SELECT status,reason,count(*) n FROM seed_sources GROUP BY status,reason ORDER BY n DESC")
 r['outbox']=rows('SELECT state,reason,count(*) n FROM outbox GROUP BY state,reason')
 r['aiUsage']=rows('SELECT * FROM ai_usage ORDER BY day')
 r['heldImports']=rows("SELECT id,reason,json_extract(doc,'$._source.url') url,json_extract(doc,'$._source.publishedDate') publishedDate FROM outbox WHERE state='held'")
 r['failedSamples']=rows("SELECT site,url,error FROM article_links WHERE parse_status='fail' ORDER BY findtime DESC LIMIT 30")
 r['controllers']=subprocess.run(['systemctl','list-units','--all','--no-pager','--plain','*recovery*','*category*','*repair*','news*'],capture_output=True,text=True).stdout
 r['processes']=subprocess.run(['pgrep','-af','node|audit|recovery|repair'],capture_output=True,text=True).stdout
else:
 r['documentStates']=rows('SELECT site,role,export_state,export_reason,count(*) n FROM forum_documents GROUP BY site,role,export_state,export_reason')
 r['urlReasons']=rows('SELECT site,processed,reason,count(*) n FROM forum_urls GROUP BY site,processed,reason')
 r['heldParents']=rows("SELECT site,native_id,thread_id,export_reason,doc,proof FROM forum_documents WHERE export_state='held' AND role='forumTopic'")
 r['ready']=rows('SELECT site,count(*) n,min(next_at) oldest,sum(resume_url IS NOT NULL) resumes,sum(completed_at IS NULL) neverCompleted FROM forum_urls WHERE processed=0 AND next_at<=? GROUP BY site',(int(time.time()*1000),))
 r['seeds']=rows('SELECT site,status,reason,count(*) n FROM forum_seeds GROUP BY site,status,reason')
 r['restartLog']=subprocess.run(['journalctl','-u','forum-flow-writer','--since','2 days ago','-p','warning','-n','40','--no-pager','-o','cat'],capture_output=True,text=True).stdout
db.close();out=root/'baseline.json';out.write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8');out.chmod(0o600)
brief={k:v for k,v in r.items() if k not in ['schema','files','heldImports','failedSamples','heldParents','processes','articleSites','documentStates','urlReasons']}
if news:brief['articleSites']=r['articleSites'][:20];brief['processes']=r['processes']
else:brief['heldParents']=[{k:v for k,v in x.items() if k not in ['doc','proof']} for x in r['heldParents']];brief['urlReasons']=sorted(r['urlReasons'],key=lambda x:x['n'],reverse=True)[:25]
print(json.dumps(brief,ensure_ascii=False))
