set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-close25-20261122
for f in transport state runner; do
 if test -f "/opt/news-flow/current/src/newsFlow/$f.mjs"; then
  install -o "$SUDO_USER" -m 0600 "/opt/news-flow/current/src/newsFlow/$f.mjs" "$upload_dir/.qc-close25-live-$f.mjs"
 fi
done
cd /opt/news-flow/current
rg -n 'siteCooldown|new NewsHttpDriver|reserveRequest|hostPause|writeAsync' src/newsFlow/state.mjs scripts/news_three_flow.mjs scripts/news_flow.mjs || true
