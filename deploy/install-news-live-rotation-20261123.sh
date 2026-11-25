set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
python3 - "$upload_dir" "$base" <<'PY'
import sys,json,shutil
from pathlib import Path
u,b=map(Path,sys.argv[1:]);delta=json.loads((u/'.news-live-rotation-delta-20261123.json').read_text());f=b/delta['path'];s=f.read_text()
if s.count(delta['before'])!=1:raise RuntimeError('LIVE_ROTATION_BASELINE_CHANGED')
shutil.copy2(f,'/var/lib/news-flow/live-priority-20261123/threeFlowState.rotation-before.mjs');p=f.with_name(f.name+'.rotation-new');p.write_text(s.replace(delta['before'],delta['after'],1));shutil.copystat(f,p);p.replace(f)
(b/'test/news-live-priority.test.mjs').write_text((u/'.news-live-priority-test-20261123.mjs').read_text())
PY
cd "$base"
/opt/news-flow/node/bin/node --test test/news-live-priority.test.mjs test/news-three-flow.test.mjs test/news-discovery-health.test.mjs test/news-category-backfill-admission.test.mjs > /var/lib/news-flow/live-priority-20261123/combined-tests.tap 2>&1 || { tail -n 65 /var/lib/news-flow/live-priority-20261123/combined-tests.tap; exit 1; }
tail -n 9 /var/lib/news-flow/live-priority-20261123/combined-tests.tap
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
