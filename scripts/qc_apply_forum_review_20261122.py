import subprocess,sqlite3,json,shutil,os,pwd,time
from pathlib import Path
root=Path('/var/lib/forum-flow/qc-20261122');backup=Path('/var/backups/forum-flow/qc-review-20261122-'+str(int(time.time())));backup.mkdir(mode=0o700)
shutil.copyfile('/tmp/forum-repair-20261119/qc_apply_forum_review_20261122.mjs',root/'apply.mjs')
subprocess.run(['systemctl','stop','forum-flow-writer'],check=True)
try:
 db=sqlite3.connect('file:/var/lib/forum-flow/runtime/state.sqlite?mode=ro',uri=True,timeout=30);dest=sqlite3.connect(backup/'state.sqlite');db.backup(dest);dest.close();db.close();shutil.copyfile(root/'forum-plan.json',backup/'plan.json')
 p=subprocess.Popen(['/opt/forum-flow/node/bin/node',str(root/'apply.mjs')],cwd='/opt/forum-flow/current',stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 for line in p.stdout:print(line.strip(),flush=True)
 rc=p.wait();err=p.stderr.read()
 if rc:raise RuntimeError('QC forum apply failed: '+err[:1500])
finally:subprocess.run(['systemctl','start','forum-flow-writer'],check=True)
account=pwd.getpwnam(os.environ['SUDO_USER']);out=Path(account.pw_dir)/'.qc-forum-apply-20261122.json';shutil.copyfile(root/'forum-apply.json',out);os.chown(out,account.pw_uid,account.pw_gid);out.chmod(0o600)
print(json.dumps({'backup':str(backup),'writer':subprocess.check_output(['systemctl','show','forum-flow-writer','-p','ActiveState,MainPID'],text=True)}))
