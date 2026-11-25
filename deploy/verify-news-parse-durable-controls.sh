#!/usr/bin/env bash
set -euo pipefail
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
release=/opt/news-flow/releases/20261115-02
test "$(readlink -f /opt/news-flow/current)" = /opt/news-flow/releases/20261115-01
install -o root -g root -m 644 "$upload_dir/.news-parser-replay.mjs" "$release/scripts/benchmark_news_parser_replay.mjs"
export PATH=/opt/news-flow/node/bin:$PATH
if ! runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; node --max-old-space-size=512 scripts/benchmark_news_parser_replay.mjs /opt/news-flow/releases/20261115-01/src/web/newsDeepAuditWorker.mjs > /var/lib/news-flow/parse-durable-replay.json"; then cat /var/lib/news-flow/parse-durable-replay.json; exit 1; fi
cat /var/lib/news-flow/parse-durable-replay.json
printf '%s\n' verified > "$release/.parse-durable-verified"
