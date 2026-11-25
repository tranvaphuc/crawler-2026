set -euo pipefail
python3 - <<'PY'
from pathlib import Path
import hashlib
p=Path('/opt/news-flow/current/src/newsFlow/threeFlowReview.mjs')
s=p.read_text()
for line in s.splitlines():
 if any(x in line for x in ['reserve(){','const cost=','AI_REVIEW_MAX_BYTES=']):print(line)
print('REVIEW_SHA256',hashlib.sha256(p.read_bytes()).hexdigest())
PY
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
cp /opt/news-flow/current/src/newsFlow/threeFlowReview.mjs "$upload_dir/.original-ai-guard.mjs"
chown "$SUDO_USER" "$upload_dir/.original-ai-guard.mjs"
