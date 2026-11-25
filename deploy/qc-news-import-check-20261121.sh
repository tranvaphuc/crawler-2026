set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
mkdir -p /var/lib/news-flow/qc-20261121
chown news-flow:news-flow /var/lib/news-flow/qc-20261121
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-news-import-reconcile-20261121.mjs" /var/lib/news-flow/qc-20261121/reconcile.mjs
runuser -u news-flow -- /opt/news-flow/node/bin/node /var/lib/news-flow/qc-20261121/reconcile.mjs > /var/lib/news-flow/qc-20261121/import-check.json
python3 - <<'PY'
import json
from pathlib import Path
d=json.loads(Path('/var/lib/news-flow/qc-20261121/import-check.json').read_text());d.pop('decisions',None);print(json.dumps(d))
PY
