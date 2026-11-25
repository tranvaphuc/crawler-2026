"""Package exactly the source files already compared against production."""
import base64, hashlib, json
from pathlib import Path
root=Path('outputs/qc-flows-2026-11-21')
def item(path,prior=None):
 data=Path(path).read_text(encoding='utf-8').encode()
 return {'path':path,'content':base64.b64encode(data).decode(),'prior':hashlib.sha256((root/prior).read_bytes()).hexdigest() if prior else None}
common=r'''
import base64,hashlib,json,os,shutil,sqlite3,subprocess,time
from pathlib import Path
flow=FLOW
files=FILES
base=Path('/opt/'+flow+'-flow/current').resolve()
backup=Path('/var/backups/'+flow+'-flow/qc-20261121-'+str(int(time.time())))
backup.mkdir(parents=True,mode=0o700)
for f in files:
 p=base/f['path']
 if f['prior']:assert hashlib.sha256(p.read_bytes()).hexdigest()==f['prior'],'Production file changed: '+f['path']
for f in files:
 p=base/f['path'];p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists():
  dest=backup/f['path'];dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
node='/opt/'+flow+'-flow/node/bin/node'
def install():
 for f in files:
  p=base/f['path'];stage=p.with_name(p.name+'.qc-stage');stage.write_bytes(base64.b64decode(f['content']))
  if p.exists():
   stat=p.stat();os.chmod(stage,stat.st_mode&0o777);os.chown(stage,stat.st_uid,stat.st_gid)
  else:os.chmod(stage,0o644)
  subprocess.run([node,'--input-type=module','--check'],input=stage.read_bytes(),check=True,capture_output=True)
  os.replace(stage,p)
'''
forum=common.replace('FLOW',repr('forum')).replace('FILES',repr([item('src/forumFlow/state.mjs','forum-state-live.mjs'),item('test/forum-queue-fairness.test.mjs')]))+r'''
writer=subprocess.check_output(['systemctl','show','forum-flow-writer','-p','MainPID','--value'],text=True).strip()
subprocess.run(['systemctl','stop','forum-flow'],check=True)
try:
 db=sqlite3.connect('file:/var/lib/forum-flow/runtime/state.sqlite?mode=ro',uri=True);dest=sqlite3.connect(backup/'state.sqlite');db.backup(dest);dest.close()
 before=[dict(zip(['site','count'],r)) for r in db.execute('SELECT site,count(*) FROM forum_urls WHERE next_at=0 GROUP BY site')];db.close()
 install()
 tests=subprocess.run([node,'--test','test/forum-flow.test.mjs','test/forum-queue-fairness.test.mjs'],cwd=base,capture_output=True,text=True)
 (backup/'tests.txt').write_text(tests.stdout+tests.stderr);assert tests.returncode==0,'Deployed forum tests failed'
finally:subprocess.run(['systemctl','start','forum-flow'],check=True)
assert writer==subprocess.check_output(['systemctl','show','forum-flow-writer','-p','MainPID','--value'],text=True).strip(),'Writer unexpectedly changed'
print(json.dumps({'backup':str(backup),'neverAttemptedBefore':before,'testSummary':tests.stdout.splitlines()[-9:],'collector':subprocess.check_output(['systemctl','show','forum-flow','-p','ActiveState,MainPID,NRestarts'],text=True)}))
'''
(root/'deploy-forum.py').write_text(forum,encoding='utf-8')
if (root/'forum-adapters-live.mjs').exists() and (root/'forum-test-live.mjs').exists():
 smiley=common.replace('FLOW',repr('forum')).replace('FILES',repr([item('src/forumFlow/adapters.mjs','forum-adapters-live.mjs'),item('test/forum-flow.test.mjs','forum-test-live.mjs')]))+forum[forum.index('writer=subprocess.check_output'):]
 (root/'deploy-forum-smilies.py').write_text(smiley,encoding='utf-8')
news=common.replace('FLOW',repr('news')).replace('FILES',repr([item('src/newsFlow/baomoiOriginalBranch.mjs','news-original-live.mjs'),item('scripts/report_news_discovery_health.mjs','news-health-live.mjs'),item('test/news-baomoi-original-branch.test.mjs')]))+r'''
ai=hashlib.sha256(Path('/etc/news-flow/ai.env').read_bytes()).hexdigest()
pids=subprocess.check_output(['systemctl','show','news-flow-seed','news-flow-parse','news-flow-import','-p','MainPID'],text=True)
install()
tests=subprocess.run([node,'--test','test/news-baomoi-original-branch.test.mjs','test/news-discovery-health.test.mjs'],cwd=base,capture_output=True,text=True)
(backup/'tests.txt').write_text(tests.stdout+tests.stderr);assert tests.returncode==0,'Deployed news tests failed'
subprocess.run(['systemctl','start','news-discovery-health.service'],check=True)
assert ai==hashlib.sha256(Path('/etc/news-flow/ai.env').read_bytes()).hexdigest()
assert pids==subprocess.check_output(['systemctl','show','news-flow-seed','news-flow-parse','news-flow-import','-p','MainPID'],text=True)
h=json.loads(Path('/var/lib/news-flow/discovery-health/latest.json').read_text())
print(json.dumps({'backup':str(backup),'testSummary':tests.stdout.splitlines()[-9:],'health':{k:h[k] for k in ['checkedAt','totalSites','alertSites','counts']},'aiConfigPreserved':True,'producerAndImporterPidsPreserved':True}))
'''
(root/'deploy-news.sh').write_text("set -euo pipefail\npython3 - <<'PY'\n"+news+"\nPY\n",encoding='utf-8')
print('Reviewed QC deployment packages prepared')
