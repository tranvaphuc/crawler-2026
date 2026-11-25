set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/recovery-all-20261123
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-recovery-all-final-group-apply.mjs" "$root/final-group-apply.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/final-group-apply.mjs"
if python3 - <<'PY'
import json,sys
from pathlib import Path
r=json.loads(Path('/var/lib/news-flow/recovery-all-20261123/final-group-overlays-applied.json').read_text());sys.exit(0 if any(s['accepted'] for s in r['sites']) else 1)
PY
then
  systemctl restart news-flow-seed news-flow-parse
fi
systemctl show news-flow-seed news-flow-parse news-flow-import -p Id,MainPID,ActiveState,NRestarts
