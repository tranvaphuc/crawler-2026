import json,subprocess,shutil,pwd,os
from pathlib import Path
root=Path('/var/lib/forum-flow/qc-20261122')
script=root/'audit.mjs';shutil.copyfile('/tmp/forum-repair-20261119/qc_review_forum_20261122.mjs',script);script.chmod(0o600)
p=subprocess.Popen(['/opt/forum-flow/node/bin/node',str(script)],cwd='/opt/forum-flow/current',stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
for line in p.stdout:print(line.strip(),flush=True)
rc=p.wait();err=p.stderr.read()
if rc:raise RuntimeError('QC forum audit failed: '+err[:1000])
account=pwd.getpwnam(os.environ['SUDO_USER']);out=Path(account.pw_dir)/'.qc-forum-plan-20261122.json';shutil.copyfile(root/'forum-plan.json',out);os.chown(out,account.pw_uid,account.pw_gid);out.chmod(0o600)
plan=json.loads((root/'forum-plan.json').read_text());print(json.dumps({'counts':{action:sum(r['action']==action for r in plan['rows']) for action in set(r['action'] for r in plan['rows'])},'parents':len(plan['rows'])}))
