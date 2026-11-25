set -euo pipefail
python3 - <<'PY'
import json,hashlib
from pathlib import Path
p=Path('/opt/news-flow/current/src/newsFlow/processor.mjs');b=p.read_bytes();root=Path('/var/lib/news-flow/recovery-all-20261123');(root/'before-processor-redirect.mjs').write_bytes(b)
print(json.dumps({'sha256':hashlib.sha256(b).hexdigest(),'anchors':[s for s in b.decode().splitlines() if "from './identity.mjs'" in s or 'else if(!finalOwner)' in s]}))
PY
