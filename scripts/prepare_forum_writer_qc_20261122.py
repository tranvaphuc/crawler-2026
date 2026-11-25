import base64,hashlib
from pathlib import Path
root=Path('outputs/qc-review-2026-11-22')
files=[]
for path,prior in [('src/forumFlow/es5.mjs','forum-es5-live.mjs'),('src/forumFlow/bulkEs5.mjs','forum-bulk-live.mjs'),('src/forumFlow/legacyOriginalClock.mjs',None),('test/forum-legacy-original-clock.test.mjs',None)]:
 files.append({'path':path,'bytes':base64.b64encode(Path(path).read_text(encoding='utf-8').encode()).decode(),'expected':hashlib.sha256((root/prior).read_bytes()).hexdigest() if prior else None})
script=r'''
import base64,hashlib,json,sqlite3,subprocess,os,shutil,time
from pathlib import Path
files=FILES
base=Path('/opt/forum-flow/current').resolve();backup=Path('/var/backups/forum-flow/qc-writer-20261122-'+str(int(time.time())));backup.mkdir(mode=0o700)
for f in files:
 p=base/f['path']
 if f['expected']:assert hashlib.sha256(p.read_bytes()).hexdigest()==f['expected'],'Production file changed: '+f['path']
collector=subprocess.check_output(['systemctl','show','forum-flow','-p','MainPID','--value'],text=True)
subprocess.run(['systemctl','stop','forum-flow-writer'],check=True)
try:
 db=sqlite3.connect('file:/var/lib/forum-flow/runtime/state.sqlite?mode=ro',uri=True,timeout=30);dest=sqlite3.connect(backup/'state.sqlite');db.backup(dest);dest.close();db.close()
 for f in files:
  p=base/f['path'];stage=p.with_name(p.name+'.qc-stage')
  if p.exists():dest=backup/f['path'];dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
  stage.write_bytes(base64.b64decode(f['bytes']));subprocess.run(['/opt/forum-flow/node/bin/node','--input-type=module','--check'],input=stage.read_bytes(),check=True,capture_output=True)
  if p.exists():st=p.stat();os.chmod(stage,st.st_mode&0o777);os.chown(stage,st.st_uid,st.st_gid)
  else:os.chmod(stage,0o644)
  os.replace(stage,p)
 tests=subprocess.run(['/opt/forum-flow/node/bin/node','--test']+[str(p.relative_to(base)) for p in (base/'test').glob('forum-*.test.mjs')],cwd=base,capture_output=True,text=True)
 (backup/'tests.txt').write_text(tests.stdout+tests.stderr)
 if tests.returncode:
  for f in files:
   old=backup/f['path']
   if old.exists():shutil.copy2(old,base/f['path'])
  raise RuntimeError('Writer tests failed; previous modules restored')
 db=sqlite3.connect('/var/lib/forum-flow/runtime/state.sqlite',timeout=30)
 held=db.execute("SELECT site,native_id,export_reason FROM forum_documents WHERE role='forumTopic' AND export_state='held' AND export_reason IN ('FORUM_EXISTING_DUPLICATE_IDENTITIES','FORUM_EXISTING_PUBLICATION_TIME_DIFFERS')").fetchall()
 (backup/'requeued-topics.json').write_text(json.dumps(held))
 for site,native,reason in held:db.execute("UPDATE forum_documents SET export_state='pending',export_reason=NULL WHERE site=? AND role='forumTopic' AND native_id=? AND export_state='held' AND export_reason=?",(site,native,reason))
 db.commit();db.close()
finally:subprocess.run(['systemctl','start','forum-flow-writer'],check=True)
assert collector==subprocess.check_output(['systemctl','show','forum-flow','-p','MainPID','--value'],text=True)
print(json.dumps({'backup':str(backup),'tests':tests.stdout.splitlines()[-9:],'requeuedTopics':len(held),'collectorPidPreserved':True,'writer':subprocess.check_output(['systemctl','show','forum-flow-writer','-p','ActiveState,MainPID'],text=True)}))
'''.replace('FILES',repr(files))
(root/'deploy-forum-writer.py').write_text(script,encoding='utf-8')
print('Prepared writer QC deployment')
