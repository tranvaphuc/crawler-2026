set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-complete27-20261122
install -o root -g root -m 0600 "$upload_dir/.qc27-molistar-routing-apply.mjs" "$root/molistar-routing-apply.mjs"
install -o news-flow -g news-flow -m 0640 "$upload_dir/.qc27-proxy-source-routing-test.mjs" /opt/news-flow/current/test/news-proxy-source-routing.test.mjs
cd /opt/news-flow/current
trap 'systemctl start news-flow-seed news-flow-parse' EXIT
systemctl stop news-flow-seed news-flow-parse
/opt/news-flow/node/bin/node --test test/news-proxy-source-routing.test.mjs test/news-flow-transport.test.mjs test/news-http-sources.test.mjs test/news-publication-adapter-identity.test.mjs > "$root/routing-tests-vps.txt"
/opt/news-flow/node/bin/node "$root/molistar-routing-apply.mjs"
systemctl start news-flow-seed news-flow-parse
trap - EXIT
install -o "$SUDO_USER" -m 0600 "$root/routing-apply-result.json" "$upload_dir/.qc27-complete-routing-apply.json"
install -o "$SUDO_USER" -m 0600 "$root/routing-tests-vps.txt" "$upload_dir/.qc27-complete-tests-vps.txt"
