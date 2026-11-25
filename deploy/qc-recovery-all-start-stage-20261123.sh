set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/recovery-all-20261123
cd /opt/news-flow/current
python3 - "$upload_dir" <<'PY'
import sys,hashlib
from pathlib import Path
home=Path(sys.argv[1]);p=Path('src/newsFlow/reviewedRecovery.mjs');b=(home/'.qc-recovery-reviewedRecovery.mjs').read_bytes()
if p.exists() and p.read_bytes()!=b:raise RuntimeError('RECOVERY_HELPER_ALREADY_DIFFERENT')
p.write_bytes(b);Path('test/news-reviewed-recovery.test.mjs').write_bytes((home/'.qc-recovery-reviewedRecovery.test.mjs').read_bytes())
PY
/opt/news-flow/node/bin/node --test test/news-reviewed-recovery.test.mjs > "$root/tests-stage-vps.txt"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-recovery-all-stage.mjs" "$root/stage.mjs"
systemd-run --unit=news-recovery-stage-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=3G --property=CPUQuota=200% --property=TasksMax=60 --working-directory=/opt/news-flow/current /opt/news-flow/node/bin/node --max-old-space-size=1024 "$root/stage.mjs"
