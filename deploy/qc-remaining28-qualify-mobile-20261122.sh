set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining28-20261122
install -d -o news-flow -g news-flow -m 0700 "$root/candidate"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc28-newsTieudungplusMobile.mjs" "$root/candidate/newsTieudungplusMobile.mjs"
install -o news-flow -g news-flow -m 0600 /opt/news-flow/current/src/web/newsPublicationPageIdentity.mjs "$root/candidate/newsPublicationPageIdentity.mjs"
ln -sfn /opt/news-flow/current/node_modules "$root/candidate/node_modules"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc28-qualify-mobile.mjs" "$root/qualify-mobile.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/qualify-mobile.mjs"
install -o "$SUDO_USER" -m 0600 "$root/mobile-qualified.json" "$upload_dir/.qc28-mobile-qualified.json"
