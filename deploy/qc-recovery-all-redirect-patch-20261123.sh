set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/recovery-all-20261123
python3 "$upload_dir/.qc-recovery-all-redirect-patch.py"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-recovery-all-redirect-canary.mjs" "$root/redirect-canary.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/redirect-canary.mjs"
python3 - <<'PY'
import json
from pathlib import Path
root=Path('/var/lib/news-flow/recovery-all-20261123');r=json.loads((root/'redirect-canary.json').read_text())
if not r['approved']:
 Path('/opt/news-flow/current/src/newsFlow/processor.mjs').write_bytes((root/'before-processor-redirect.mjs').read_bytes())
 raise RuntimeError('REDIRECT_CANARY_NOT_APPROVED_ROLLED_BACK')
PY
systemctl restart news-flow-seed news-flow-parse
systemctl show news-flow-seed news-flow-parse news-flow-import -p Id,MainPID,ActiveState,NRestarts
