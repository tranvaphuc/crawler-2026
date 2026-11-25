set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-complete27-20261122
install -o root -g root -m 0600 "$upload_dir/.qc27-complete-postcheck.mjs" "$root/postcheck.mjs"
cd /opt/news-flow/current
/opt/news-flow/node/bin/node "$root/postcheck.mjs"
for file in postcheck.json qualified-sites.json apply-result.json routing-apply-result.json routing-tests-vps.txt route-controls.json proxy-matrix.json extra-controls.json deployed-molistar.com.json deployed-saoexpress.vn.json deployed-news-http-profiles.json; do
  install -o "$SUDO_USER" -m 0600 "$root/$file" "$upload_dir/.qc27-complete-$file"
done
