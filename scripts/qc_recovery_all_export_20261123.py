import csv,gzip,hashlib,json,sqlite3,time,subprocess,os,pwd,shutil
from pathlib import Path

root=Path('/var/lib/news-flow/recovery-all-20261123')
audit=sqlite3.connect('file:'+str(root/'audit.sqlite')+'?mode=ro',uri=True);audit.row_factory=sqlite3.Row
live=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);live.row_factory=sqlite3.Row
baseline=json.loads(audit.execute("SELECT value FROM meta WHERE key='baseline'").fetchone()[0])
def rows(db,sql,args=()):return [dict(r) for r in db.execute(sql,args)]
def load(name):
 p=root/(name+'.json');return json.loads(p.read_text()) if p.exists() else {}
health=json.loads(Path('/var/lib/news-flow/stability-20261123/current-discovery-health.json').read_text())
assert audit.execute("SELECT count(*) FROM cohort WHERE status!='done'").fetchone()[0]==0
current_counts={};decisions={};site_counts={};reason_counts={};total=0
fields=['url','site','old_reason','initial_qc_outcome','initial_qc_reason','repair_outcome','repair_reason','fresh_outcome','fresh_reason','stage_status','es_status','current_status','current_error','decision','evidence_file','evidence_sha256']
with gzip.open(root/'news-url-results.csv.gz','wt',encoding='utf-8-sig',newline='') as stream:
 writer=csv.DictWriter(stream,fieldnames=fields);writer.writeheader()
 query="""SELECT c.*,r.outcome repair_outcome,r.reason repair_reason,r.evidence_file repaired_file,f.outcome fresh_outcome,f.reason fresh_reason,f.proof fresh_proof,s.status stage_status,e.status es_status FROM cohort c LEFT JOIN repair_results r USING(parse_key) LEFT JOIN recovery_followup f USING(parse_key) LEFT JOIN stage_results s USING(parse_key) LEFT JOIN es_readbacks e USING(parse_key) ORDER BY c.site,c.parse_key"""
 for item in audit.execute(query):
  c=dict(item);now=live.execute('SELECT parse_status,error FROM article_links WHERE parse_key=?',(c['parse_key'],)).fetchone();status=now['parse_status'] if now else 'missing';error=now['error'] if now else None
  decision='recovered' if status=='done' else 'excluded_non_article' if c['stage_status']=='excluded' else 'still_requires_review'
  current_counts[status]=current_counts.get(status,0)+1;decisions[decision]=decisions.get(decision,0)+1
  s=site_counts.setdefault(c['site'],{});s[decision]=s.get(decision,0)+1
  reason=error or c['fresh_reason'] or c['repair_reason'] or c['reason'] or '';reason_counts[reason]=reason_counts.get(reason,0)+1
  evidence=c['repaired_file'] or c['evidence_file']
  if c['fresh_proof']:
   proof=json.loads(c['fresh_proof']);evidence=proof.get('file') or evidence
  writer.writerow({'url':c['url'],'site':c['site'],'old_reason':c['old_reason'],'initial_qc_outcome':c['outcome'],'initial_qc_reason':c['reason'],'repair_outcome':c['repair_outcome'],'repair_reason':c['repair_reason'],'fresh_outcome':c['fresh_outcome'],'fresh_reason':c['fresh_reason'],'stage_status':c['stage_status'],'es_status':c['es_status'],'current_status':status,'current_error':error,'decision':decision,'evidence_file':evidence,'evidence_sha256':Path(evidence).name.split('.')[0] if evidence else None});total+=1
assert total==109723
base_health=baseline['health'];old_signals=set(base_health['counts']);current_by_site={s['site']:s for s in health['sites']}
source_probe={s['site']:s for s in load('source-audit').get('sites',[])};http_probe={s['site']:s for s in load('http-source-audit').get('sites',[])}
sources=[]
for before in base_health['sites']:
 site=before['site'];after=current_by_site.get(site,{});alerts=[a for a in after.get('alerts',[]) if a in old_signals];p=source_probe.get(site,{});h=http_probe.get(site,{})
 def compact(probe):return {'seedRestorable':probe.get('seedRestorable'),'approved':probe.get('approved'),'error':probe.get('error'),'quarantine':probe.get('quarantine'),'checks':[{k:v for k,v in c.items() if k in ['url','kind','statusCode','error','finalUrl','articleLinks','feedItems','nativeApiItems','file']} for c in probe.get('checks',[])],'articles':[{k:v for k,v in a.items() if k in ['url','outcome','reason','file']} for a in probe.get('articles',[])]}
 seeds=rows(live,'SELECT url,status,reason,links_found,last_at FROM seed_sources WHERE site=?',(site,))
 sources.append({'site':site,'initialAlerts':before['alerts'],'remainingComparableAlerts':alerts,'currentAdditionalAlerts':[a for a in after.get('alerts',[]) if a not in old_signals],'cohort':site_counts.get(site,{}),'nativeRoutes':compact(p),'officialHttpRoutes':compact(h),'seeds':seeds})
ai=rows(live,'SELECT * FROM ai_usage ORDER BY day');old_ai=baseline.get('aiUsage',[])
old_map={x['day']:x for x in old_ai};history_preserved=all(x==old_map[x['day']] for x in ai if x['day'] in old_map and x['day']<'2026-11-23')
assert history_preserved
safe_ai={}
for line in Path('/etc/news-flow/ai.env').read_text().splitlines():
 if '=' in line:
  k,v=line.split('=',1)
  if k in ['NEWS_AI_MODEL','AI_DAILY_MAX_CALLS','AI_DAILY_BUDGET_USD','NEWS_AI_ENABLED']:safe_ai[k]=v
report={'at':int(time.time()*1000),'snapshotAt':baseline['snapshotAt'],'cohort':total,'auditComplete':True,'currentStates':current_counts,'decisions':decisions,'stage':rows(audit,'SELECT status,count(*) n FROM stage_results GROUP BY status'),'esReadbacks':rows(audit,'SELECT status,count(*) n FROM es_readbacks GROUP BY status'),'unprocessedEligible':audit.execute("SELECT count(*) FROM cohort c LEFT JOIN stage_results s USING(parse_key) LEFT JOIN repair_results r ON r.parse_key=c.parse_key AND r.outcome='verified' WHERE (c.outcome IN ('verified','excluded') OR r.parse_key IS NOT NULL) AND s.parse_key IS NULL").fetchone()[0],'reasons':sorted([{'reason':k,'n':v} for k,v in reason_counts.items()],key=lambda x:-x['n']),'sources':sources,'clearedInitialSites':[s['site'] for s in sources if not s['remainingComparableAlerts']],'remainingInitialSites':[s['site'] for s in sources if s['remainingComparableAlerts']],'additionalOperationalSites':[{'site':s['site'],'alerts':[a for a in s['alerts'] if a in old_signals]} for s in health['sites'] if s['site'] not in source_probe and any(a in old_signals for a in s['alerts'])],'expandedHealth':{'at':health['checkedAt'],'alertSites':health['alertSites'],'counts':health['counts']},'aiUsage':ai,'historicalAiUsagePreserved':history_preserved,'safeAiConfig':safe_ai,'manualPaidAiCalls':0,'outbox':rows(live,'SELECT state,count(*) n,min(created_at) oldest FROM outbox GROUP BY state') if 'created_at' in [r['name'] for r in live.execute('PRAGMA table_info(outbox)')] else rows(live,'SELECT state,count(*) n FROM outbox GROUP BY state'),'services':subprocess.check_output(['systemctl','show','news-flow-seed','news-flow-parse','news-flow-import','news-flow-baomoi-original','-p','Id,MainPID,ActiveState,NRestarts,ExecMainStartTimestamp'],text=True),'resources':{'memory':subprocess.check_output(['free','-m'],text=True),'disk':subprocess.check_output(['df','-h','/var/lib/news-flow'],text=True)}}
report['historyAudit']=load('history-quarantine-audit');report['nativeRedirectCanary']=load('redirect-canary');report['finalGroupProposalSummary']=load('final-group-proposal-summary')
(root/'QC-NEWS-RESULT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
downloads=root/'download';downloads.mkdir(exist_ok=True)
names=['QC-NEWS-RESULT.json','news-url-results.csv.gz','source-audit.json','http-source-audit.json','new-operational-source-audit.json','new-source-restoration.json','overlays-applied.json','group-overlays-applied.json','http-overlays-applied.json','es-readback-summary.json','history-quarantine-audit.json','release-verification.json','redirect-canary.json','final-group-proposal-summary.json','audit-summary.json','stage-summary.json']
manifest=[];home=Path(pwd.getpwnam(os.environ['SUDO_USER']).pw_dir)
for name in names:
 p=root/name
 if not p.exists():continue
 target=home/('.qc-recovery-final-'+name);shutil.copyfile(p,target);os.chown(target,pwd.getpwnam(os.environ['SUDO_USER']).pw_uid,pwd.getpwnam(os.environ['SUDO_USER']).pw_gid);target.chmod(0o600);manifest.append({'name':name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(home/'.qc-recovery-final-manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({k:v for k,v in report.items() if k in ['at','cohort','auditComplete','currentStates','decisions','stage','esReadbacks','unprocessedEligible','clearedInitialSites','remainingInitialSites','additionalOperationalSites','expandedHealth','historicalAiUsagePreserved','safeAiConfig','manualPaidAiCalls','outbox']},ensure_ascii=False))
