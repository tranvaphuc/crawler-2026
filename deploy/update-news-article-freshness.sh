#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
release=/opt/news-flow/releases/20261113-13
previous=$(readlink -f /opt/news-flow/current)
test "$previous" = /opt/news-flow/releases/20261113-12
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
install -o root -g root -m 644 "$upload_dir/.news-flow-article32.service" /var/lib/news-flow/diagnostics/news-flow-article32-candidate.service
systemd-analyze verify /var/lib/news-flow/diagnostics/news-flow-article32-candidate.service
install -o root -g root -m 600 /etc/systemd/system/news-flow.service /var/lib/news-flow/diagnostics/news-flow-before-article-freshness.service
systemctl stop news-flow.service
rollback(){ install -o root -g root -m 644 /var/lib/news-flow/diagnostics/news-flow-before-article-freshness.service /etc/systemd/system/news-flow.service; systemctl daemon-reload; ln -sfn "$previous" /opt/news-flow/current; systemctl start news-flow.service; }
trap rollback ERR
python3 - <<'PY'
import sqlite3,os
target='/var/lib/news-flow/backups/write-before-article-freshness-20261113.sqlite'
if os.path.exists(target):raise RuntimeError('BACKUP_ALREADY_EXISTS')
source=sqlite3.connect('/var/lib/news-flow/news-flow-runtime/write.sqlite');dest=sqlite3.connect(target)
source.backup(dest);dest.close();source.close();os.chmod(target,0o600)
PY
install -o root -g root -m 644 /var/lib/news-flow/diagnostics/news-flow-article32-candidate.service /etc/systemd/system/news-flow.service
systemctl daemon-reload
ln -sfn "$release" /opt/news-flow/current
systemctl start news-flow.service
systemctl show news-flow.service -p ActiveState -p SubState -p MainPID -p NRestarts -p ExecMainStatus
echo ARTICLE_FRESHNESS_DEPLOYED
