set -euo pipefail
python3 - <<'PY'
import hashlib,json
from pathlib import Path
base=Path('/opt/news-flow/current');root=Path('/var/lib/news-flow/recovery-all-20261123');out=[]
for file in ['src/newsFlow/processor.mjs','src/newsFlow/transport.mjs','src/newsFlow/threeFlowState.mjs']:
 p=base/file;b=p.read_bytes();(root/('before-liveness-'+p.name)).write_bytes(b);lines=b.decode().splitlines();out.append({'file':file,'sha256':hashlib.sha256(b).hexdigest(),'anchors':[l for l in lines if 'seedNextRoundReasons' in l or 'completeHttpResponse(cycle' in l or 'failedUrl(' in l or "reviewFailed:task.reason==='manual_refresh'" in l or "normalization:page.normalization" in l]})
print(json.dumps(out))
PY
