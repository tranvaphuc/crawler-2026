import base64,hashlib
from pathlib import Path
root=Path('outputs/qc-review-2026-11-22');baseline=(root/'news-three-flow-live.mjs').read_text(encoding='utf-8')
old="if(details.normalization==='public_publication_feed_listing'&&details.links>0)"
new="if(['public_publication_feed_listing','publisher_public_news_api','public_government_api','public_web30_state','static_public_api_fields'].includes(details.normalization)&&details.links>0)"
assert baseline.count(old)==1
payload={'expected':hashlib.sha256((root/'news-three-flow-live.mjs').read_bytes()).hexdigest(),'old':old,'new':new,'test':base64.b64encode(Path('test/news-normalized-seed-ledger.test.mjs').read_text(encoding='utf-8').encode()).decode()}
script=r'''
import base64,hashlib,json,subprocess,sqlite3,shutil,os,time
from pathlib import Path
patch=PATCH
base=Path('/opt/news-flow/current').resolve();p=base/'src/newsFlow/threeFlowState.mjs';assert hashlib.sha256(p.read_bytes()).hexdigest()==patch['expected'],'Production source changed'
backup=Path('/var/backups/news-flow/qc-seed-shell-20261122-'+str(int(time.time())));backup.mkdir(mode=0o700);shutil.copy2(p,backup/p.name)
ai=hashlib.sha256(Path('/etc/news-flow/ai.env').read_bytes()).hexdigest();db=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);usage=db.execute('SELECT * FROM ai_usage ORDER BY day').fetchall();db.close()
pids=subprocess.check_output(['systemctl','show','news-flow-parse','news-flow-import','-p','MainPID'],text=True)
body=p.read_text();assert body.count(patch['old'])==1;body=body.replace(patch['old'],patch['new'])
stage=p.with_name(p.name+'.qc-stage');stage.write_text(body);st=p.stat();os.chmod(stage,st.st_mode&0o777);os.chown(stage,st.st_uid,st.st_gid)
subprocess.run(['/opt/news-flow/node/bin/node','--input-type=module','--check'],input=stage.read_bytes(),check=True,capture_output=True)
os.replace(stage,p);test=base/'test/news-normalized-seed-ledger.test.mjs';test.write_bytes(base64.b64decode(patch['test']));test.chmod(0o644)
tests=subprocess.run(['/opt/news-flow/node/bin/node','--test','test/news-normalized-seed-ledger.test.mjs','test/news-three-flow.test.mjs','test/news-tuyengiao-public.test.mjs','test/news-publication-listing.test.mjs'],cwd=base,capture_output=True,text=True);(backup/'tests.txt').write_text(tests.stdout+tests.stderr)
if tests.returncode:shutil.copy2(backup/p.name,p);raise RuntimeError('Seed tests failed; previous code restored')
subprocess.run(['systemctl','restart','news-flow-seed'],check=True)
assert pids==subprocess.check_output(['systemctl','show','news-flow-parse','news-flow-import','-p','MainPID'],text=True)
assert ai==hashlib.sha256(Path('/etc/news-flow/ai.env').read_bytes()).hexdigest()
db=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);after=db.execute('SELECT * FROM ai_usage ORDER BY day').fetchall();db.close()
print(json.dumps({'backup':str(backup),'tests':tests.stdout.splitlines()[-9:],'parseAndImportPidsPreserved':True,'aiConfigPreserved':True,'aiLedgerUnchanged':usage==after,'services':subprocess.check_output(['systemctl','show','news-flow-seed','news-flow-parse','news-flow-import','-p','Id,MainPID,ActiveState'],text=True)}))
'''.replace('PATCH',repr(payload))
(root/'deploy-news-seed.sh').write_text("set -euo pipefail\npython3 - <<'PY'\n"+script+"\nPY\n",encoding='utf-8')
print('Prepared one-hunk deployment, preserving other live changes')
