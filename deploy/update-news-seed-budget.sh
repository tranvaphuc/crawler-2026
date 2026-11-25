#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
release=/opt/news-flow/releases/20261113-09
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
cp /etc/systemd/system/news-flow.service "$release/news-flow.previous.service"
systemctl stop news-flow.service
rollback(){ install -o root -g root -m 644 "$release/news-flow.previous.service" /etc/systemd/system/news-flow.service; ln -sfn "$previous" /opt/news-flow/current; systemctl daemon-reload; systemctl start news-flow.service; }
trap rollback ERR
install -o root -g root -m 644 "$upload_dir/.news-flow-seed-budget.service" /etc/systemd/system/news-flow.service
ln -sfn "$release" /opt/news-flow/current
systemctl daemon-reload
systemctl start news-flow.service
systemctl show news-flow.service -p ActiveState -p SubState -p MainPID -p NRestarts -p ExecMainStatus
echo INDEPENDENT_SEED_BUDGET_DEPLOYED
