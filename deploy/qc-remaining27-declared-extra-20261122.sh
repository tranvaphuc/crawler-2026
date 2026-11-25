set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining27-all-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc27-declared-extra.mjs" "$root/declared-extra.mjs"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc27-declared-extra-jobs.json" "$root/declared-extra-jobs.json"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/declared-extra.mjs"
install -o "$SUDO_USER" -m 0600 "$root/declared-extra.json" "$upload_dir/.qc27-declared-extra-result.json"
