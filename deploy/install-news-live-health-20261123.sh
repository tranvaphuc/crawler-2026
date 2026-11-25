set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
python3 - "$upload_dir" "$base" <<'PY'
from pathlib import Path
import hashlib,sys,shutil
u,b=map(Path,sys.argv[1:]);f=b/'src/newsFlow/discoveryHealth.mjs';text=f.read_text()
if hashlib.sha256(text.encode()).hexdigest()!='3d0834c300c9b43b7c938e31053f46c17ced74ed0361be46c3099b7239e13b87':raise RuntimeError('HEALTH_BASELINE_CHANGED')
shutil.copy2(f,'/var/lib/news-flow/live-priority-20261123/discoveryHealth.before.mjs');f.write_text((u/'.news-live-health-20261123.mjs').read_text());(b/'test/news-discovery-health.test.mjs').write_text((u/'.news-live-health-test-20261123.mjs').read_text())
f=b/'test/news-three-flow.test.mjs';s=f.read_text();old="runtime.report().masterAdmission,'all_eligible_when_empty'";new="runtime.report().masterAdmission,'live_alongside_backfill'"
if s.count(old)!=1:raise RuntimeError('REPORT_TEST_ANCHOR_CHANGED')
f.write_text(s.replace(old,new))
f=b/'src/newsFlow/threeFlowRuntime.mjs';s=f.read_text();old='if(live.added)this.onReport';new='if(live.added||live.promoted)this.onReport'
if s.count(old)!=1:raise RuntimeError('PROMOTION_REPORT_ANCHOR_CHANGED')
f.write_text(s.replace(old,new))
PY
cd "$base"
/opt/news-flow/node/bin/node --test test/news-live-priority.test.mjs test/news-discovery-health.test.mjs test/news-three-flow.test.mjs test/news-category-backfill-admission.test.mjs > /var/lib/news-flow/live-priority-20261123/combined-tests.tap 2>&1 || { tail -n 65 /var/lib/news-flow/live-priority-20261123/combined-tests.tap; exit 1; }
tail -n 9 /var/lib/news-flow/live-priority-20261123/combined-tests.tap
install -d -m 0755 /run/systemd/system/news-flow-seed.service.d
printf '[Service]\nTimeoutStopSec=180\n' > /run/systemd/system/news-flow-seed.service.d/live-priority-drain-20261123.conf
cleanup() { systemctl start news-flow-seed; rm -f /run/systemd/system/news-flow-seed.service.d/live-priority-drain-20261123.conf; systemctl daemon-reload; }
trap cleanup EXIT
systemctl daemon-reload
systemctl stop news-flow-seed
systemctl start news-flow-seed
systemctl is-active news-flow-seed news-flow-parse news-flow-import
