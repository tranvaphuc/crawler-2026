#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
previous=/opt/news-flow/releases/20261114-21
release=/opt/news-flow/releases/20261115-01
test "$(readlink -f /opt/news-flow/current)" = "$previous"
test ! -e "$release"
install -d -o root -g root -m 755 "$release"
tar --extract --gzip --file "$upload_dir/.news-parse-throughput.tar.gz" --directory "$release" --no-same-owner
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
a,b=map(Path,sys.argv[1:]);allowed={'src/newsFlow/processor.mjs','src/newsFlow/threeFlowCapacity.mjs','src/web/newsFieldVerification.mjs','src/web/newsDeepAuditWorker.mjs','src/web/newsRepairPool.mjs'}
def manifest(root):
 return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['src/newsFlow','src/web','config/web-sources'] for p in (root/folder).rglob('*') if p.is_file() and str(p.relative_to(root)) not in allowed}
assert manifest(a)==manifest(b), 'UNEXPECTED_MASTER_HTTP_DB_ES_CHANGE'
old=(a/'src/newsFlow/processor.mjs').read_text();new=(b/'src/newsFlow/processor.mjs').read_text();assert old.replace('parserRoundTripMs:Date.now()-parseStarted}', 'parserRoundTripMs:Date.now()-parseStarted,parserQueueMs:audit.parserQueueMs,parserWorkerRoundTripMs:audit.parserWorkerRoundTripMs,parserWorkerExecutionMs:audit.workerExecutionMs}')==new
c=dict(l.split('=',1) for l in Path('/etc/news-flow/ai.env').read_text().splitlines() if '=' in l)
assert float(c['AI_DAILY_BUDGET_USD'].strip('"'))==2 and int(c['AI_DAILY_MAX_CALLS'].strip('"'))==200
print('MASTER_HTTP_DB_ES_AND_AI_BUDGET_PRESERVED')
PYREMOTE
export PATH=/opt/news-flow/node/bin:$PATH
if ! runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; npm test > /var/lib/news-flow/parse-throughput-tests.tap 2>&1"; then tail -n 90 /var/lib/news-flow/parse-throughput-tests.tap; exit 1; fi
tail -n 9 /var/lib/news-flow/parse-throughput-tests.tap
echo REPLAYING_REAL_HTML_WITH_OLD_AND_NEW_PARSER
if ! runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; node --max-old-space-size=512 scripts/benchmark_news_parser_replay.mjs '$previous/src/web/newsDeepAuditWorker.mjs' > /var/lib/news-flow/parse-throughput-replay.json"; then cat /var/lib/news-flow/parse-throughput-replay.json; exit 1; fi
cat /var/lib/news-flow/parse-throughput-replay.json
printf '%s\n' verified > "$release/.parse-throughput-verified"
echo PARSE_THROUGHPUT_PREPARED_NO_PRODUCTION_RESTART
