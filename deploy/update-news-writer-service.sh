#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
release=/opt/news-flow/releases/20261113-16
previous=$(readlink -f /opt/news-flow/current)
test "$previous" = /opt/news-flow/releases/20261113-15
test ! -e "$release"
test ! -e /etc/systemd/system/news-flow-writer.service
test ! -e /etc/systemd/system/news-flow.slice
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
candidate=/var/lib/news-flow/diagnostics/writer-split-units
install -d -o root -g root -m 755 "$candidate"
tar --extract --gzip --file "$upload_dir/.news-flow-writer-units.tar.gz" --directory "$candidate" --no-same-owner
chown root:root "$candidate/news-flow.service" "$candidate/news-flow-writer.service" "$candidate/news-flow.slice"
chmod 644 "$candidate/news-flow.service" "$candidate/news-flow-writer.service" "$candidate/news-flow.slice"
systemd-analyze verify "$candidate/news-flow.service" "$candidate/news-flow-writer.service" "$candidate/news-flow.slice"
install -o root -g root -m 600 /etc/systemd/system/news-flow.service /var/lib/news-flow/diagnostics/news-flow-before-writer-split.service
systemctl stop news-flow.service
test "$(systemctl show news-flow.service -p MainPID --value)" = 0
rollback(){
 systemctl stop news-flow-writer.service news-flow.service || true
 systemctl disable news-flow-writer.service || true
 install -o root -g root -m 644 /var/lib/news-flow/diagnostics/news-flow-before-writer-split.service /etc/systemd/system/news-flow.service
 rm -f -- /etc/systemd/system/news-flow-writer.service /etc/systemd/system/news-flow.slice
 systemctl daemon-reload
 ln -sfn "$previous" /opt/news-flow/current
 systemctl start news-flow.service
}
trap rollback ERR
python3 - <<'PY'
import sqlite3,os
target='/var/lib/news-flow/backups/write-before-writer-service-20261113.sqlite'
if os.path.exists(target):raise RuntimeError('BACKUP_ALREADY_EXISTS')
source=sqlite3.connect('/var/lib/news-flow/news-flow-runtime/write.sqlite');dest=sqlite3.connect(target)
source.backup(dest);dest.close();source.close();os.chmod(target,0o600)
PY
install -o root -g root -m 644 "$candidate/news-flow.service" /etc/systemd/system/news-flow.service
install -o root -g root -m 644 "$candidate/news-flow-writer.service" /etc/systemd/system/news-flow-writer.service
install -o root -g root -m 644 "$candidate/news-flow.slice" /etc/systemd/system/news-flow.slice
systemctl daemon-reload
ln -sfn "$release" /opt/news-flow/current
systemctl enable news-flow.service news-flow-writer.service
systemctl start news-flow-writer.service news-flow.service
systemctl is-active --quiet news-flow.service
systemctl is-active --quiet news-flow-writer.service
systemctl show news-flow.service news-flow-writer.service -p Id -p ActiveState -p SubState -p MainPID -p NRestarts -p ControlGroup
systemctl show news-flow.slice -p CPUQuotaPerSecUSec -p MemoryMax -p TasksMax
echo DEDICATED_ES_CREATE_WRITER_DEPLOYED
