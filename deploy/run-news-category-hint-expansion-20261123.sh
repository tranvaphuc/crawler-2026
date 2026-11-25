#!/bin/bash
set -euo pipefail
base=$(readlink -f /opt/news-flow/current)
cd "$base"
while true; do
 runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/ingest_news_category_hints_20261123.mjs
 runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/admit_news_category_backfill_20261123.mjs --continue
 if ! python3 - <<'PY'
import json
r=json.load(open('/var/lib/news-flow/category-coverage-20261123/hint-expansion-progress.json'));raise SystemExit(0 if r['pendingPages']==0 else 1)
PY
 then
  if ! systemctl is-active --quiet news-category-audit-20261123; then
   if ! systemctl start news-category-audit-20261123 2>/dev/null; then
    systemd-run --unit=news-category-audit-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=5G --property=CPUQuota=300% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=100 --working-directory="$base" /opt/news-flow/node/bin/node --max-old-space-size=1024 scripts/audit_news_category_coverage.mjs
   fi
  fi
 fi
 if python3 - <<'PY'
import json
r=json.load(open('/var/lib/news-flow/category-coverage-20261123/hint-expansion-progress.json'));raise SystemExit(0 if r['pendingPages'] or r['unadmittedCandidates'] or r['waitingBackfill'] else 1)
PY
 then
  if ! systemctl is-active --quiet news-category-initial-backfill-20261123; then
   if ! systemctl start news-category-initial-backfill-20261123 2>/dev/null; then
    systemd-run --unit=news-category-initial-backfill-20261123 --property=MemoryMax=3G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=32 --property=Restart=on-failure --property=RestartSec=30 --working-directory="$base" /usr/bin/flock --exclusive --nonblock --no-fork /var/lib/news-flow/locks/category-initial-apply.lock /usr/local/libexec/run-news-category-initial-backfill.sh
   fi
  fi
  if ! systemctl is-active --quiet news-category-transient-review-20261123; then
   if ! systemctl start news-category-transient-review-20261123 2>/dev/null; then
    systemd-run --unit=news-category-transient-review-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=3G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=32 --property=Restart=on-failure --property=RestartSec=30 --property=TimeoutStopSec=60 --setenv=NEWS_CATEGORY_REVIEW_APPLY=1 --working-directory="$base" /opt/news-flow/node/bin/node scripts/recheck_news_category_transients_v2.mjs
   fi
  fi
 fi
 if python3 - <<'PY'
import json,subprocess
from pathlib import Path
r=Path('/var/lib/news-flow/category-coverage-20261123');p=json.loads((r/'hint-expansion-progress.json').read_text());review=json.loads((r/'transient-review-report.json').read_text()) if (r/'transient-review-report.json').exists() else {};units=['news-category-audit-20261123','news-category-initial-backfill-20261123','news-category-transient-review-20261123'];active=[u for u in units if subprocess.run(['systemctl','is-active','--quiet',u]).returncode==0];previous=json.loads((r/'hint-expansion-status.json').read_text()) if (r/'hint-expansion-status.json').exists() else {};quiet=not p['added'] and not p['pendingPages'] and not p['unadmittedCandidates'] and not p['waitingBackfill'] and not active and review.get('complete') is True and review.get('apply') is True;stable=previous.get('stableRounds',0)+1 if quiet else 0;status={**p,'active':active,'stableRounds':stable,'complete':stable>=2};(r/'hint-expansion-status.json').write_text(json.dumps(status,indent=2));print(json.dumps(status));raise SystemExit(0 if status['complete'] else 1)
PY
 then break; fi
 sleep 60
done
