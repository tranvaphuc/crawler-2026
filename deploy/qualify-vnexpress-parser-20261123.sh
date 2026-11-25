set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -m 0644 "$upload_dir/.qualify-vnexpress-parser-20261123.mjs" /opt/news-flow/current/scripts/qualify_vnexpress_parser_20261123.mjs
install -o news-flow -g news-flow -m 0600 "$upload_dir/.vnexpress-candidate-config.json" /var/lib/news-flow/vnexpress-miss-20261123/candidate-config.json
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/qualify_vnexpress_parser_20261123.mjs > /var/lib/news-flow/vnexpress-parser-qualification.log 2>&1
tail -n 24 /var/lib/news-flow/vnexpress-parser-qualification.log
