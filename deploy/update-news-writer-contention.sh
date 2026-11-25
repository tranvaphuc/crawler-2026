#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
release=/opt/news-flow/releases/20261113-19
previous=$(readlink -f /opt/news-flow/current)
test "$previous" = /opt/news-flow/releases/20261113-18
test ! -e "$release"
override=/etc/systemd/system/news-flow.service.d/30-backlog-priority.conf
test -e "$override"
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
producer_pid=$(systemctl show news-flow.service -p MainPID --value)
systemctl stop news-flow-writer.service
rollback(){ ln -sfn "$previous" /opt/news-flow/current; systemctl start news-flow-writer.service; }
trap rollback ERR
ln -sfn "$release" /opt/news-flow/current
systemctl start news-flow-writer.service
systemctl is-active --quiet news-flow.service
systemctl is-active --quiet news-flow-writer.service
test "$(systemctl show news-flow.service -p MainPID --value)" = "$producer_pid"
systemctl show news-flow.service news-flow-writer.service -p Id -p MainPID -p ActiveState -p SubState -p NRestarts
echo WRITER_CONTENTION_FIX_DEPLOYED
