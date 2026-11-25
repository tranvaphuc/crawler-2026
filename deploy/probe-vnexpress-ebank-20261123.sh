set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -m 0644 "$upload_dir/.probe-vnexpress-ebank-20261123.mjs" /opt/news-flow/current/scripts/probe_vnexpress_ebank_20261123.mjs
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/probe_vnexpress_ebank_20261123.mjs > /var/lib/news-flow/vnexpress-ebank-probe.log 2>&1
tail -n 25 /var/lib/news-flow/vnexpress-ebank-probe.log
