#!/bin/bash
set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
stage=/var/lib/news-flow/live-priority-20261123
install -d -m 0755 "$stage"
python3 - "$upload_dir/.news-live-priority-20261123.tar.gz" "$base" "$stage" <<'PY'
import json,tarfile,shutil,sys
from pathlib import Path
bundle,base,stage=map(Path,sys.argv[1:])
shutil.copytree(base/'src',stage/'src',dirs_exist_ok=True);shutil.copytree(base/'test',stage/'test',dirs_exist_ok=True)
for name in ['node_modules','config','scripts']:
 if not (stage/name).exists():(stage/name).symlink_to(base/name,target_is_directory=True)
shutil.copyfile(base/'package.json',stage/'package.json')
with tarfile.open(bundle) as t:
 for delta in json.load(t.extractfile('delta.json')):
  file=stage/delta['path'];text=file.read_text()
  if text.count(delta['before'])!=1:raise RuntimeError('LIVE_PRIORITY_BASELINE_CHANGED '+delta['path'])
  file.write_text(text.replace(delta['before'],delta['after'],1))
 for name in ['src/newsFlow/liveAdmission.mjs','test/news-live-priority.test.mjs','test/news-discovery-health.test.mjs']:(stage/name).write_bytes(t.extractfile(name).read())
p=stage/'test/news-three-flow.test.mjs';s=p.read_text();s=s.replace("runtime.report().masterAdmission,'all_eligible_when_empty'","runtime.report().masterAdmission,'live_alongside_backfill'");p.write_text(s)
PY
cd "$stage"
/opt/news-flow/node/bin/node --test test/news-live-priority.test.mjs test/news-three-flow.test.mjs test/news-category-backfill-admission.test.mjs test/news-discovery-health.test.mjs > tests.tap 2>&1 || { tail -n 75 tests.tap; exit 1; }
tail -n 10 tests.tap
python3 - "$upload_dir/.news-live-priority-20261123.tar.gz" "$base" "$stage" <<'PY'
import json,tarfile,shutil,sys,sqlite3,time,os
from pathlib import Path
bundle,base,stage=map(Path,sys.argv[1:])
def replace(p,text):
 q=p.with_name(p.name+'.live-priority-new');q.write_text(text);shutil.copystat(p,q);q.replace(p)
with tarfile.open(bundle) as t:
 deltas=json.load(t.extractfile('delta.json'));texts={}
 for delta in deltas:
  file=base/delta['path'];text=texts.get(str(file),file.read_text())
  if text.count(delta['before'])!=1:raise RuntimeError('LIVE_PRIORITY_CONCURRENT_CHANGE '+delta['path'])
  texts[str(file)]=text.replace(delta['before'],delta['after'],1)
 for name,text in texts.items():
  file=Path(name);shutil.copy2(file,stage/(file.name+'.before'));replace(file,text)
 for name in ['src/newsFlow/liveAdmission.mjs','test/news-live-priority.test.mjs','test/news-discovery-health.test.mjs']:
  file=base/name;file.write_bytes(t.extractfile(name).read());os.chmod(file,0o644)
db=sqlite3.connect('/var/lib/news-flow/news-flow-runtime/write.sqlite',timeout=30)
with db:
 db.execute('INSERT OR IGNORE INTO flow_meta(key,value) VALUES(?,?)',['live_priority_deployed_20261123',json.dumps({'at':int(time.time()*1000),'liveShare':0.8,'seedPollMs':120000,'workerLimitsChanged':False})])
(stage/'ai-ledger-before.json').write_text(json.dumps(db.execute('SELECT * FROM ai_usage ORDER BY day').fetchall()));db.close();print('LIVE_PRIORITY_SOURCE_INSTALLED')
PY
for service in news-flow-seed news-flow-parse; do
 install -d -m 0755 "/run/systemd/system/$service.service.d"
 printf '[Service]\nTimeoutStopSec=180\n' > "/run/systemd/system/$service.service.d/live-priority-drain-20261123.conf"
done
cleanup() {
 systemctl start news-flow-seed news-flow-parse
 for service in news-flow-seed news-flow-parse; do rm -f "/run/systemd/system/$service.service.d/live-priority-drain-20261123.conf"; done
 systemctl daemon-reload
}
trap cleanup EXIT
systemctl daemon-reload
systemctl stop news-flow-seed news-flow-parse
systemctl start news-flow-seed news-flow-parse
systemctl is-active news-flow-seed news-flow-parse news-flow-import
