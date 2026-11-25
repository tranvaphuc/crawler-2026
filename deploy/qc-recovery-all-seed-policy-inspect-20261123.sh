set -euo pipefail
python3 - <<'PY'
import json
from pathlib import Path
p=Path('/opt/news-flow/current/src/newsFlow/threeFlowState.mjs');lines=p.read_text().splitlines();found=set(range(min(24,len(lines))))
for i,line in enumerate(lines):
 if 'seedTransientFailure' in line or 'isConfiguredTransientSeedFailure' in line or 'reopenSeedTimeouts()' in line:found.update(range(max(0,i-2),min(len(lines),i+7)))
print(json.dumps({'text':'\n'.join(lines[i] for i in sorted(found))}));
PY
