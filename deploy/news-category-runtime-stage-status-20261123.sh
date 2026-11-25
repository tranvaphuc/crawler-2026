set -euo pipefail
python3 - <<'PY'
from pathlib import Path
s=Path('/var/lib/news-flow/category-runtime-stage-20261123/tests.tap').read_text().splitlines()
for i,l in enumerate(s):
 if l.startswith('not ok'):print('\n'.join(s[i:i+42]))
PY
systemctl is-active news-flow-seed news-flow-parse news-flow-import
