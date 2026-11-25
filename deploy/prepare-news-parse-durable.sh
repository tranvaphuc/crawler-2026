#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
previous=/opt/news-flow/releases/20261115-01
release=/opt/news-flow/releases/20261115-02
test "$(readlink -f /opt/news-flow/current)" = "$previous"
test ! -e "$release"
install -d -o root -g root -m 755 "$release"
tar --extract --gzip --file "$upload_dir/.news-parse-durable.tar.gz" --directory "$release" --no-same-owner
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
a,b=map(Path,sys.argv[1:]);allowed={'src/newsFlow/processor.mjs','src/newsFlow/threeFlowState.mjs','src/newsFlow/seedLinksWorker.mjs','src/newsFlow/transport.mjs','src/newsFlow/sqliteDiagnostics.mjs'}
def manifest(root):
 return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['src/newsFlow','src/web','config/web-sources'] for p in (root/folder).rglob('*') if p.is_file() and str(p.relative_to(root)) not in allowed}
assert manifest(a)==manifest(b), 'UNEXPECTED_MASTER_HTTP_DB_ES_CHANGE'
old=(a/'src/newsFlow/threeFlowState.mjs').read_text();new=(b/'src/newsFlow/threeFlowState.mjs').read_text()
assert old[old.index(' master(role,'):old.index(' recoverRole(')]==new[new.index(' master(role,'):new.index(' recoverRole(')], 'MASTER_CHANGED'
assert old[old.index(' cleanup(now='):old.index(' loadOverlays(')]==new[new.index(' cleanup(now='):new.index(' loadOverlays(')], 'RETENTION_CHANGED'
x=(a/'src/newsFlow/transport.mjs').read_text();y=(b/'src/newsFlow/transport.mjs').read_text();assert x.replace("if(prepared&&!result.error)Object.defineProperty(result,'prepared'", "if(prepared?.result?.reviewSample)this.state.prepareReviewSample?.({cycle,url_key:requestKey(url)},prepared.result.reviewSample);if(prepared&&!result.error)Object.defineProperty(result,'prepared'")==y, 'HTTP_BEHAVIOR_CHANGED'
c=dict(l.split('=',1) for l in Path('/etc/news-flow/ai.env').read_text().splitlines() if '=' in l)
assert float(c['AI_DAILY_BUDGET_USD'].strip('"'))==2 and int(c['AI_DAILY_MAX_CALLS'].strip('"'))==200
print('MASTER_HTTP_DB_ES_AND_AI_BUDGET_PRESERVED')
PYREMOTE
export PATH=/opt/news-flow/node/bin:$PATH
if ! runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; npm test > /var/lib/news-flow/parse-durable-tests.tap 2>&1"; then tail -n 90 /var/lib/news-flow/parse-durable-tests.tap; exit 1; fi
tail -n 9 /var/lib/news-flow/parse-durable-tests.tap
echo REPLAYING_REAL_HTML_WITH_OLD_AND_NEW_PARSER
if ! runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; node --max-old-space-size=512 scripts/benchmark_news_parser_replay.mjs '$previous/src/web/newsDeepAuditWorker.mjs' > /var/lib/news-flow/parse-durable-replay.json"; then cat /var/lib/news-flow/parse-durable-replay.json; exit 1; fi
cat /var/lib/news-flow/parse-durable-replay.json
printf '%s\n' verified > "$release/.parse-durable-verified"
echo PARSE_THROUGHPUT_PREPARED_NO_PRODUCTION_RESTART
