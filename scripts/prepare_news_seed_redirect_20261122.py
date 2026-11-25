import base64,hashlib
from pathlib import Path
root=Path('outputs/qc-review-2026-11-22');live=(root/'news-three-flow-before-redirect.mjs').read_text(encoding='utf-8');local=Path('src/newsFlow/threeFlowState.mjs').read_text(encoding='utf-8')
start=' completeSeed(task,';end=' storePreparedSample('
old=live[live.index(start):live.index(end)];new=local[local.index(start):local.index(end)]
records=[{'path':'src/newsFlow/threeFlowState.mjs','expected':hashlib.sha256((root/'news-three-flow-before-redirect.mjs').read_bytes()).hexdigest(),'old':old,'new':new},{'path':'src/newsFlow/processor.mjs','expected':hashlib.sha256((root/'news-processor-before-redirect.mjs').read_bytes()).hexdigest(),'old':'normalization:page.normalization,seedWorkerMs','new':'normalization:page.normalization,finalUrl:page.finalUrl||url,seedWorkerMs'}]
test=base64.b64encode(Path('test/news-normalized-seed-ledger.test.mjs').read_text(encoding='utf-8').encode()).decode()
script=r'''
import base64,hashlib,json,subprocess,sqlite3,shutil,os,time
from pathlib import Path
patches=PATCHES
base=Path('/opt/news-flow/current').resolve();backup=Path('/var/backups/news-flow/qc-seed-redirect-20261122-'+str(int(time.time())));backup.mkdir(mode=0o700)
for patch in patches:
 p=base/patch['path'];assert hashlib.sha256(p.read_bytes()).hexdigest()==patch['expected'],'Production source changed';assert p.read_text().count(patch['old'])==1
 dest=backup/p.name;shutil.copy2(p,dest)
ai=hashlib.sha256(Path('/etc/news-flow/ai.env').read_bytes()).hexdigest();pids=subprocess.check_output(['systemctl','show','news-flow-parse','news-flow-import','-p','MainPID'],text=True)
for patch in patches:
 p=base/patch['path'];stage=p.with_name(p.name+'.qc-stage');stage.write_text(p.read_text().replace(patch['old'],patch['new']));st=p.stat();os.chmod(stage,st.st_mode&0o777);os.chown(stage,st.st_uid,st.st_gid);subprocess.run(['/opt/news-flow/node/bin/node','--input-type=module','--check'],input=stage.read_bytes(),check=True,capture_output=True);os.replace(stage,p)
test=base/'test/news-normalized-seed-ledger.test.mjs';test.write_bytes(base64.b64decode(TEST));test.chmod(0o644)
tests=subprocess.run(['/opt/news-flow/node/bin/node','--test','test/news-normalized-seed-ledger.test.mjs','test/news-three-flow.test.mjs','test/news-tuyengiao-public.test.mjs','test/news-publication-listing.test.mjs'],cwd=base,capture_output=True,text=True);(backup/'tests.txt').write_text(tests.stdout+tests.stderr)
if tests.returncode:
 for patch in patches:shutil.copy2(backup/Path(patch['path']).name,base/patch['path'])
 raise RuntimeError('Tests failed; source restored')
subprocess.run(['systemctl','restart','news-flow-seed'],check=True)
assert pids==subprocess.check_output(['systemctl','show','news-flow-parse','news-flow-import','-p','MainPID'],text=True)
assert ai==hashlib.sha256(Path('/etc/news-flow/ai.env').read_bytes()).hexdigest()
print(json.dumps({'backup':str(backup),'tests':tests.stdout.splitlines()[-9:],'parseAndImportPidsPreserved':True,'aiConfigPreserved':True,'seed':subprocess.check_output(['systemctl','show','news-flow-seed','-p','ActiveState,MainPID'],text=True)}))
'''.replace('PATCHES',repr(records)).replace('TEST',repr(test))
(root/'deploy-news-redirect.sh').write_text("set -euo pipefail\npython3 - <<'PY'\n"+script+"\nPY\n",encoding='utf-8');print('Prepared owned-redirect correction')
