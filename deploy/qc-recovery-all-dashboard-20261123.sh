set -euo pipefail
python3 - <<'PY'
import json,sqlite3,subprocess,os,pwd
from pathlib import Path
r=Path('/var/lib/news-flow/recovery-all-20261123');d=sqlite3.connect('file:'+str(r/'audit.sqlite')+'?mode=ro',uri=True);d.row_factory=sqlite3.Row
out={'counts':[dict(x) for x in d.execute('SELECT status,outcome,count(*) n FROM cohort GROUP BY status,outcome')],'stage':[dict(x) for x in d.execute('SELECT status,reason,count(*) n FROM stage_results GROUP BY status,reason')],'aiUsage':[dict(x) for x in d.execute("SELECT * FROM ai_usage ORDER BY day")] if False else [],'services':subprocess.check_output(['systemctl','show','news-recovery-all-v2-20261123','news-recovery-proposals-20261123','news-recovery-sources-20261123','news-recovery-stage-v5-20261123','news-recovery-offline-repair-v2-20261123','news-recovery-final-groups-20261123','news-recovery-redirect-final-20261123','news-flow-seed','news-flow-parse','news-flow-import','news-flow-baomoi-original','-p','Id,MainPID,ActiveState,NRestarts,MemoryCurrent,Result'],text=True),'memory':subprocess.check_output(['free','-m'],text=True)}
live=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);live.row_factory=sqlite3.Row;out['aiUsage']=[dict(x) for x in live.execute('SELECT * FROM ai_usage ORDER BY day')];out['outbox']=[dict(x) for x in live.execute('SELECT state,count(*) n FROM outbox GROUP BY state')];out['receiptsSinceSnapshot']=[dict(x) for x in live.execute('SELECT status,count(*) n FROM import_receipts WHERE imported_at>=? GROUP BY status',(json.loads(d.execute("SELECT value FROM meta WHERE key='baseline'").fetchone()[0])['snapshotAt'],))]
out['repair']=[dict(x) for x in d.execute('SELECT site,outcome,count(*) n FROM repair_results GROUP BY site,outcome')]
for name in ['proposal-summary','source-audit','http-source-audit','group-proposal-summary','final-group-proposal-summary','repair-summary-v2','es-readback-summary','followup-summary','redirect-recovery-summary']:
 p=r/(name+'.json')
 if not p.exists():continue
 v=json.loads(p.read_text())
 if name in ['repair-summary-v2','redirect-recovery-summary','es-readback-summary','followup-summary']:
  out[name]={'at':v.get('at'),'counts':v.get('counts',[]),'processed':v.get('processed'),'candidates':v.get('candidates'),'finishedAt':v.get('finishedAt'),'complete':v.get('complete')};continue
 out[name]={'finishedAt':v.get('finishedAt'),'checked':len(v.get('sites',[])),'approved':[s['site'] for s in v.get('sites',[]) if s.get('approved') or s.get('seedRestorable')]}
 if name=='source-audit':out[name]['sites']=[{'site':s['site'],'error':s.get('error'),'quarantine':s.get('quarantine'),'checks':len(s.get('checks',[])),'routes':[{'url':p['url'],'status':p.get('statusCode'),'error':p.get('error'),'links':p.get('articleLinks'),'api':p.get('nativeApiItems'),'feed':p.get('feedItems')} for p in s.get('checks',[])],'articles':[{'url':a['url'],'outcome':a.get('outcome'),'reason':a.get('reason')} for a in s.get('articles',[])]} for s in v.get('sites',[])]
home=pwd.getpwnam(os.environ['SUDO_USER']);p=Path(home.pw_dir)/'.qc-recovery-all-dashboard.json';p.write_text(json.dumps(out,ensure_ascii=False,indent=2));os.chown(p,home.pw_uid,home.pw_gid);p.chmod(0o600)
print(json.dumps({k:v for k,v in out.items() if k not in ['source-audit','services']}));print(out['services'])
PY
