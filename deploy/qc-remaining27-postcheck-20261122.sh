set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining27-all-20261122
install -o root -g root -m 0600 "$upload_dir/.qc27-postcheck.mjs" "$root/postcheck.mjs"
cd /opt/news-flow/current
/opt/news-flow/node/bin/node "$root/postcheck.mjs"
for file in postcheck.json safety-apply-result.json safety-tests-vps.txt nhansac-all-posts.json biggo-public-api.json declared-extra.json biggo-detail-controls.json; do
  install -o "$SUDO_USER" -m 0600 "$root/$file" "$upload_dir/.qc27-$file"
done
