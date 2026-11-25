set -euo pipefail
python3 - <<'PY'
import json,hashlib,subprocess
from pathlib import Path
base=Path('/opt/news-flow/current');r={'release':str(base.resolve()),'files':[],'services':subprocess.check_output(['systemctl','show','news-flow-seed','news-flow-parse','news-flow-import','news-flow-baomoi-original','-p','Id,MainPID,ActiveState,NRestarts,ExecMainStartTimestamp'],text=True)}
for name in ['src/newsFlow/processor.mjs','src/newsFlow/reviewedRecovery.mjs','src/newsFlow/threeFlowState.mjs','src/newsFlow/discoveryHealth.mjs','src/web/newsPublicationPageIdentity.mjs','src/newsFlow/originalReconciliationRead.mjs']:
 p=base/name;b=p.read_bytes();text=b.decode();r['files'].append({'path':name,'sha256':hashlib.sha256(b).hexdigest(),'nativeRedirect':"originalNative===redirectNative" in text,'requestedHistoryGuard':"publicationHistoryUnconfirmed(task.url" in text,'categoryBackfill':"category_backfill" in text,'legacyEsTimeoutGuard':"displayName==='RequestTimeout'" in text})
root=Path('/var/lib/news-flow/recovery-all-20261123');(root/'release-verification.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
PY
