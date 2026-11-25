#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
release=/opt/news-flow/releases/20261113-04
previous=$(readlink -f /opt/news-flow/current)
test ! -e "$release"
install -d -o root -g root -m 755 "$release"
tar --extract --gzip --file "$upload_dir/.news-flow-release-20261113.tar.gz" --directory "$release" --no-same-owner
chown -R root:root "$release"
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
ln -s /etc/news-flow/news.env "$release/.env"
ln -s /var/lib/news-flow "$release/outputs"
export PATH=/opt/news-flow/node/bin:$PATH
if cmp -s "$previous/package.json" "$release/package.json"; then
 ln -s "$previous/node_modules" "$release/node_modules"
 install -o root -g root -m 644 "$previous/package-lock.json" "$release/package-lock.json"
else
 (cd "$release"; npm install --ignore-scripts --no-audit --no-fund > /var/lib/news-flow/npm-install-repairs.log 2>&1)
 chmod -R a+rX,go-w "$release/node_modules"
fi
runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; npm test > /var/lib/news-flow/deploy-tests.tap 2>&1"
tail -n 9 /var/lib/news-flow/deploy-tests.tap
systemctl stop news-flow.service
trap 'systemctl start news-flow.service' ERR
install -d -o root -g root -m 700 /var/lib/news-flow/backups
python3 - <<'PY'
import sqlite3,os
source='/var/lib/news-flow/news-flow-runtime/write.sqlite'
target='/var/lib/news-flow/backups/write-before-runtime-repairs-20261113.sqlite'
if os.path.exists(target):raise RuntimeError('BACKUP_ALREADY_EXISTS')
src=sqlite3.connect(source);dst=sqlite3.connect(target)
src.backup(dst,pages=4096);dst.close();src.close();os.chmod(target,0o600)
print('QUEUE_BACKUP_COMPLETE',flush=True)
PY
ln -sfn "$release" /opt/news-flow/current
systemctl start news-flow.service
systemctl show news-flow.service -p ActiveState -p SubState -p MainPID -p NRestarts -p ExecMainStatus
echo RUNTIME_REPAIRS_DEPLOYED
