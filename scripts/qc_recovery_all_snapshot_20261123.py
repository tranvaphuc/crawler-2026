"""Freeze every current failed news URL or due forum URL before a full recovery pass."""
import datetime,hashlib,json,os,pwd,sqlite3,time,subprocess
from pathlib import Path
news=Path('/opt/news-flow/current').exists();flow='news' if news else 'forum';root=Path('/var/lib/'+flow+'-flow/recovery-all-20261123');root.mkdir(exist_ok=True,mode=0o700);now=int(time.time()*1000)
src=sqlite3.connect('file:/var/lib/'+flow+'-flow/'+('news-flow-runtime/write.sqlite' if news else 'runtime/state.sqlite')+'?mode=ro',uri=True,timeout=20);src.row_factory=sqlite3.Row
out={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'snapshotAt':now,'flow':flow,'services':subprocess.check_output(['systemctl','show',*(['news-flow-seed','news-flow-parse','news-flow-import','news-flow-baomoi-original'] if news else ['forum-flow','forum-flow-writer']),'-p','Id,ActiveState,MainPID,NRestarts,ExecMainStartTimestamp'],text=True)}
audit=root/'audit.sqlite'
if audit.exists():
 check=sqlite3.connect(audit);frozen=check.execute("SELECT value FROM meta WHERE key='baseline'").fetchone();check.close()
 if frozen:raise RuntimeError('RECOVERY_COHORT_ALREADY_FROZEN')
 audit.rename(root/('audit-incomplete-'+str(now)+'.sqlite'))
dest=sqlite3.connect(audit);dest.execute('PRAGMA journal_mode=WAL');dest.execute('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)')
src.execute('BEGIN')
if news:
 dest.execute("CREATE TABLE cohort(parse_key TEXT PRIMARY KEY,url TEXT NOT NULL,site TEXT NOT NULL,old_reason TEXT,old_reviewed_at INTEGER,old_config_version TEXT,old_first_at INTEGER,old_failure_at INTEGER,status TEXT NOT NULL DEFAULT 'pending',outcome TEXT,reason TEXT,checked_at INTEGER,config_sha TEXT,evidence_file TEXT,doc TEXT,proof TEXT,transport_error TEXT,source_api_url TEXT)")
 rows=[dict(r) for r in src.execute("SELECT a.parse_key,a.url,a.site,a.error old_reason,coalesce(a.reviewed_at,0) old_reviewed_at,a.config_version old_config_version,a.first_at old_first_at,(SELECT max(f.last_at) FROM url_failures f WHERE f.url_key=a.url) old_failure_at FROM article_links a WHERE a.parse_status='fail' ORDER BY a.site,a.first_at,a.parse_key")]
 dest.executemany('INSERT INTO cohort(parse_key,url,site,old_reason,old_reviewed_at,old_config_version,old_first_at,old_failure_at) VALUES(:parse_key,:url,:site,:old_reason,:old_reviewed_at,:old_config_version,:old_first_at,:old_failure_at)',rows)
 dest.execute('CREATE INDEX cohort_site_status ON cohort(site,status)');dest.execute('CREATE INDEX cohort_status ON cohort(status)')
 out['cohortCount']=len(rows);out['sites']=[dict(r) for r in src.execute("SELECT site,count(*) n FROM article_links WHERE parse_status='fail' GROUP BY site ORDER BY n DESC")];out['reasons']=[dict(r) for r in src.execute("SELECT error,count(*) n FROM article_links WHERE parse_status='fail' GROUP BY error ORDER BY n DESC")]
 out['aiUsage']=[dict(r) for r in src.execute('SELECT * FROM ai_usage ORDER BY day')]
 out['overlays']=[{'site':r['site'],'revision':r['revision'],'verified_at':r['verified_at']} for r in src.execute('SELECT * FROM parser_overlays')]
 out['health']=json.loads(Path('/var/lib/news-flow/stability-20261123/current-discovery-health.json').read_text())
 for name in ['article_links','url_failures','article_catalog','seed_sources']:
  dest.execute('CREATE TABLE before_'+name+'(row_json TEXT NOT NULL)')
  sql="SELECT * FROM "+name+(" WHERE parse_status='fail'" if name=='article_links' else " WHERE "+('role=\'article\'' if name=='url_failures' else '1=1'))
  if name=='article_catalog':
   saved=(src.execute('SELECT * FROM article_catalog WHERE url_key=?',(row['url'],)).fetchone() for row in rows)
   dest.executemany('INSERT INTO before_'+name+' VALUES(?)',((json.dumps(dict(r),ensure_ascii=False),) for r in saved if r is not None))
  else:dest.executemany('INSERT INTO before_'+name+' VALUES(?)',((json.dumps(dict(r),ensure_ascii=False),) for r in src.execute(sql)))
else:
 dest.execute('CREATE TABLE cohort(site TEXT NOT NULL,native_id TEXT NOT NULL,url TEXT NOT NULL,before_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT \'pending\',last_observed TEXT,PRIMARY KEY(site,native_id))')
 rows=[dict(r) for r in src.execute('SELECT * FROM forum_urls WHERE processed=0 AND next_at<=? ORDER BY site,next_at,seen,native_id',(now,))]
 dest.executemany('INSERT INTO cohort(site,native_id,url,before_json) VALUES(?,?,?,?)',((r['site'],r['native_id'],r['url'],json.dumps(r,ensure_ascii=False)) for r in rows))
 out['cohortCount']=len(rows);out['readyBySite']=[dict(r) for r in src.execute('SELECT site,count(*) n,sum(reason IS NULL) no_reason,sum(completed_at IS NULL) never_complete,sum(next_at=0) never_scheduled,min(next_at) oldest_next,min(seen) oldest_seen FROM forum_urls WHERE processed=0 AND next_at<=? GROUP BY site',(now,))]
 out['reasons']=[dict(r) for r in src.execute('SELECT site,reason,count(*) n FROM forum_urls WHERE processed=0 AND next_at<=? GROUP BY site,reason ORDER BY n DESC',(now,))]
 out['recentActivity']=[dict(r) for r in src.execute('SELECT site,kind,count(*) n,max(at) latest FROM forum_events WHERE at>=? GROUP BY site,kind',(now-3600000,))]
 out['documents']=[dict(r) for r in src.execute('SELECT export_state,count(*) n FROM forum_documents GROUP BY export_state')]
 out['runtimeFlags']={}
 dest.execute('CREATE TABLE before_documents(row_json TEXT NOT NULL)');dest.executemany('INSERT INTO before_documents VALUES(?)',((json.dumps(dict(r),ensure_ascii=False),) for r in src.execute("SELECT site,role,native_id,thread_id,export_state,export_reason FROM forum_documents WHERE export_state IN ('held','pending')")))
src.rollback();src.close();dest.execute('INSERT INTO meta VALUES(?,?)',('baseline',json.dumps(out,ensure_ascii=False)));dest.commit();dest.close();(root/'baseline.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
if news:
 user=pwd.getpwnam('news-flow');os.chown(root,user.pw_uid,user.pw_gid);os.chown(audit,user.pw_uid,user.pw_gid);os.chown(root/'baseline.json',user.pw_uid,user.pw_gid)
out_small={**out,'sites':out.get('sites',[])[:30],'reasons':out['reasons'][:35],'overlays':len(out.get('overlays',[]))}
if news:
 account=pwd.getpwnam(os.environ['SUDO_USER']);p=Path(account.pw_dir)/'.qc-recovery-all-baseline.json';p.write_bytes((root/'baseline.json').read_bytes());os.chown(p,account.pw_uid,account.pw_gid);p.chmod(0o600)
print(json.dumps(out_small,ensure_ascii=False))
