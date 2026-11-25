set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
release=$(readlink -f /opt/news-flow/current)
printf '%s\n' "$release"
install -m 644 "$upload_dir/.audit-camau-remaining.mjs" "$release/scripts/audit_camau_remaining_20261120.mjs"
mkdir -p /var/lib/news-flow/baocamau-remaining-20261120
chown news-flow:news-flow /var/lib/news-flow/baocamau-remaining-20261120
cd "$release"
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/audit_camau_remaining_20261120.mjs
tar -czf "$upload_dir/.camau-remaining-evidence.tgz" -C /var/lib/news-flow/baocamau-remaining-20261120 .
chown "$SUDO_USER" "$upload_dir/.camau-remaining-evidence.tgz"
chmod 600 "$upload_dir/.camau-remaining-evidence.tgz"
tar -czf "$upload_dir/.camau-code-baseline.tgz" -C "$release" src/web/configurableNewsParser.mjs src/web/newsNativeVideoDescription.mjs src/web/newsUserConfirmedTimezone.mjs src/web/newsResearchTransport.mjs src/newsFlow/registry.mjs src/newsFlow/identity.mjs src/newsFlow/originalSourceQualification.mjs
chown "$SUDO_USER" "$upload_dir/.camau-code-baseline.tgz"
chmod 600 "$upload_dir/.camau-code-baseline.tgz"
