#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
test -d "$upload_dir"
release=/opt/news-flow/releases/20261113-02
test ! -e "$release"
install -d -o root -g root -m 755 "$release"
tar --extract --gzip --file "$upload_dir/.news-flow-release-20261113.tar.gz" --directory "$release" --no-same-owner
chown -R root:root /opt/news-flow/node-v22.* "$release"
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
install -o root -g news-flow -m 640 "$upload_dir/.news-flow-config-20261113.env" /etc/news-flow/news.env
install -o root -g news-flow -m 640 "$upload_dir/.news-flow-proxy-20261113.json" /etc/news-flow/proxies.json
install -o root -g news-flow -m 640 "$upload_dir/.news-flow-proof-20261113.json" /etc/news-flow/identity-proof.json
ln -sfn /etc/news-flow/identity-proof.json /var/lib/news-flow/news-flow-build-2026-11-12/identity-proof.json
ln -sfn /etc/news-flow/proxies.json /var/lib/news-flow/news-flow-runtime/proxies.credentials.json
ln -s /var/lib/news-flow "$release/outputs"
ln -s /etc/news-flow/news.env "$release/.env"
export PATH=/opt/news-flow/node/bin:$PATH
cd "$release"
npm install --ignore-scripts --no-audit --no-fund > /var/lib/news-flow/npm-install.log 2>&1
chmod -R a+rX,go-w "$release/node_modules"
ln -sfn "$release" /opt/news-flow/current
echo NEWS_RELEASE_INSTALLED
node --version
npm --version
