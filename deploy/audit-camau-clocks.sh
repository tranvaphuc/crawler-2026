set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
cd /opt/news-flow/current
install -m 644 "$upload_dir/.audit-camau-clocks.mjs" scripts/audit_camau_clocks_20261120.mjs
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/audit_camau_clocks_20261120.mjs
tar -czf "$upload_dir/.camau-clock-evidence.tgz" -C /var/lib/news-flow/baocamau-remaining-20261120/clocks .
chown "$SUDO_USER" "$upload_dir/.camau-clock-evidence.tgz"
chmod 600 "$upload_dir/.camau-clock-evidence.tgz"
