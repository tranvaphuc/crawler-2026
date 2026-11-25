set -euo pipefail
python3 - <<'PY'
import os,signal
from pathlib import Path
p=Path('/proc/2034557/cmdline')
if p.exists() and 'scripts/qualify_news_category_coverage.mjs' in p.read_bytes().replace(b'\0',b' ').decode():
 os.kill(2034557,signal.SIGTERM);print('SUPERSEDED_MANUAL_QUALIFIER_STOPPED')
else:print('SUPERSEDED_MANUAL_QUALIFIER_ALREADY_FINISHED')
PY
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -m 0644 "$upload_dir/.apply_news_category_coverage.mjs" /opt/news-flow/current/scripts/apply_news_category_coverage.mjs
