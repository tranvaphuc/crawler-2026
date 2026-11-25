set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -m 0644 "$upload_dir/.apply-vnexpress-coverage-20261123.mjs" /opt/news-flow/current/scripts/apply_vnexpress_coverage_20261123.mjs
cd /opt/news-flow/current
/opt/news-flow/node/bin/node scripts/apply_vnexpress_coverage_20261123.mjs
