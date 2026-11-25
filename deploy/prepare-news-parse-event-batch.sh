#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
previous=/opt/news-flow/releases/20261115-02
release=/opt/news-flow/releases/20261115-03
test "$(readlink -f /opt/news-flow/current)" = "$previous"
test ! -e "$release"
install -d -m 755 "$release"
tar --extract --gzip --file "$upload_dir/.news-parse-event-batch.tar.gz" --directory "$release" --no-same-owner
chown -R root:root "$release"
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
ln -s /etc/news-flow/news.env "$release/.env"
ln -s /var/lib/news-flow "$release/outputs"
ln -s "$(readlink -f "$previous/node_modules")" "$release/node_modules"
install -m 644 "$previous/package-lock.json" "$release/package-lock.json"
python3 - "$previous" "$release" <<'PYREMOTE'
from pathlib import Path
import hashlib,json,sys
a,b=map(Path,sys.argv[1:]);allowed={'src/newsFlow/processor.mjs','src/newsFlow/threeFlowState.mjs'}
def manifest(root):
 return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['src/newsFlow','src/web','config/web-sources'] for p in (root/folder).rglob('*') if p.is_file() and str(p.relative_to(root)) not in allowed}
assert manifest(a)==manifest(b), 'PARSER_HTTP_ES_OR_CAPACITY_CHANGED'
x=(a/'src/newsFlow/threeFlowState.mjs').read_text();y=(b/'src/newsFlow/threeFlowState.mjs').read_text()
for begin,end in [(' master(role,',' recoverRole('),(' cleanup(now=',' loadOverlays(')]:assert x[x.index(begin):x.index(end)]==y[y.index(begin):y.index(end)]
r=json.loads(Path('/var/lib/news-flow/parse-durable-replay.json').read_text());assert not r['mismatches'] and r['parsed']>=10
c=dict(l.split('=',1) for l in Path('/etc/news-flow/ai.env').read_text().splitlines() if '=' in l);assert float(c['AI_DAILY_BUDGET_USD'].strip('"'))==2 and int(c['AI_DAILY_MAX_CALLS'].strip('"'))==200
print('PARSER_REPLAY_STILL_VALID_UNCHANGED_PARSER_HTTP_MASTER_ES_AND_BUDGET')
PYREMOTE
export PATH=/opt/news-flow/node/bin:$PATH
if ! runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; npm test > /var/lib/news-flow/parse-event-batch-tests.tap 2>&1"; then tail -n 90 /var/lib/news-flow/parse-event-batch-tests.tap; exit 1; fi
tail -n 9 /var/lib/news-flow/parse-event-batch-tests.tap
printf '%s\n' verified > "$release/.parse-event-batch-verified"
