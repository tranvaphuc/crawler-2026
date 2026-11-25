set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining27-all-20261122
install -d -o news-flow -g news-flow -m 0700 "$root"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc27-all-cohort.json" "$root/cohort.json"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc27-all-probe.mjs" "$root/all-probe.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/all-probe.mjs"
install -o "$SUDO_USER" -m 0600 "$root/all-probe.json" "$upload_dir/.qc27-all-probe-result.json"
