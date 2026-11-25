#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
previous=/opt/news-flow/releases/20261114-20
release=/opt/news-flow/releases/20261114-21
test "$(readlink -f /opt/news-flow/current)" = "$previous"
test ! -e "$release"
install -d -o root -g root -m 755 "$release"
tar --extract --gzip --file "$upload_dir/.news-sqlite-maintenance.tar.gz" --directory "$release" --no-same-owner
chown -R root:root "$release"
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
ln -s /etc/news-flow/news.env "$release/.env"
ln -s /var/lib/news-flow "$release/outputs"
ln -s "$previous/node_modules" "$release/node_modules"
install -o root -g root -m 644 "$previous/package-lock.json" "$release/package-lock.json"
python3 - "$previous" "$release" <<'PYREMOTE'
from pathlib import Path
import hashlib,sys
a,b=map(Path,sys.argv[1:]);allowed={'src/newsFlow/threeFlowState.mjs','src/newsFlow/threeFlowRuntime.mjs','src/newsFlow/sqliteDiagnostics.mjs'}
def manifest(root):
 return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['src/newsFlow','src/web','config/web-sources'] for p in (root/folder).rglob('*') if p.is_file() and str(p.relative_to(root)) not in allowed}
assert manifest(a)==manifest(b), 'UNEXPECTED_HTTP_PARSER_ES_OR_CAPACITY_CHANGE'
def master(root):
 s=(root/'src/newsFlow/threeFlowState.mjs').read_text();return s[s.index(' master(role,'):s.index(' recoverRole(')]
assert master(a)==master(b), 'MASTER_ADMISSION_CHANGED'
for root in [a,b]:
 s=(root/'src/newsFlow/threeFlowRuntime.mjs').read_text();assert "masterAdmission:'all_eligible_when_empty'" in s
c=dict(l.split('=',1) for l in Path('/etc/news-flow/ai.env').read_text().splitlines() if '=' in l)
assert float(c['AI_DAILY_BUDGET_USD'].strip('"'))==2 and int(c['AI_DAILY_MAX_CALLS'].strip('"'))==200
print('MASTER_HTTP_ES_WORKERS_AND_AI_BUDGET_PRESERVED')
PYREMOTE
export PATH=/opt/news-flow/node/bin:$PATH
echo RUNNING_LINUX_REGRESSION_TESTS
if ! runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; npm test > /var/lib/news-flow/sqlite-maintenance-tests.tap 2>&1"; then tail -n 90 /var/lib/news-flow/sqlite-maintenance-tests.tap; exit 1; fi
tail -n 9 /var/lib/news-flow/sqlite-maintenance-tests.tap
echo COMPARING_OLD_AND_NEW_ON_PRIVATE_DATABASE
if ! runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; node --max-old-space-size=512 scripts/benchmark_news_maintenance.mjs '$previous/src/newsFlow/threeFlowState.mjs' > /var/lib/news-flow/sqlite-maintenance-benchmark.json"; then cat /var/lib/news-flow/sqlite-maintenance-benchmark.json; exit 1; fi
cat /var/lib/news-flow/sqlite-maintenance-benchmark.json
printf '%s\n' verified > "$release/.maintenance-verified"
echo SQLITE_MAINTENANCE_RELEASE_PREPARED_NO_PRODUCTION_RESTART
