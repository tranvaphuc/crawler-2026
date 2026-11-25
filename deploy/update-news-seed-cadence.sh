#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
release=/opt/news-flow/releases/20261113-05
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
cmp -s "$previous/package.json" "$release/package.json"
ln -s "$previous/node_modules" "$release/node_modules"
install -o root -g root -m 644 "$previous/package-lock.json" "$release/package-lock.json"
runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; npm test > /var/lib/news-flow/deploy-tests.tap 2>&1"
tail -n 9 /var/lib/news-flow/deploy-tests.tap
systemctl stop news-flow.service
rollback(){ ln -sfn "$previous" /opt/news-flow/current; systemctl start news-flow.service; }
trap rollback ERR
python3 - <<'PY'
import sqlite3,os,shutil
source='/var/lib/news-flow/news-flow-runtime/write.sqlite'
target='/var/lib/news-flow/backups/write-before-seed-cadence-20261113.sqlite'
if os.path.exists(target):raise RuntimeError('BACKUP_ALREADY_EXISTS')
if shutil.disk_usage('/var/lib/news-flow').free<os.path.getsize(source)*2:raise RuntimeError('INSUFFICIENT_BACKUP_SPACE')
src=sqlite3.connect(source);dst=sqlite3.connect(target)
src.backup(dst,pages=4096);dst.close();src.close();os.chmod(target,0o600)
print('QUEUE_BACKUP_COMPLETE',flush=True)
PY
ln -sfn "$release" /opt/news-flow/current
systemctl start news-flow.service
systemctl show news-flow.service -p ActiveState -p SubState -p MainPID -p NRestarts -p ExecMainStatus
echo PER_PUBLISHER_SEED_CADENCE_DEPLOYED
