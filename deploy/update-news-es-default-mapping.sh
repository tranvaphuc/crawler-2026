#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
release=/opt/news-flow/releases/20261114-01
previous=$(readlink -f /opt/news-flow/current)
test "$previous" = /opt/news-flow/releases/20261113-24
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
cmp -s "$previous/src/newsFlow/threeFlowState.mjs" "$release/src/newsFlow/threeFlowState.mjs"
ln -s "$previous/node_modules" "$release/node_modules"
install -o root -g root -m 644 "$previous/package-lock.json" "$release/package-lock.json"
runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; npm test > /var/lib/news-flow/deploy-tests.tap 2>&1"
tail -n 9 /var/lib/news-flow/deploy-tests.tap
seed_pid=$(systemctl show news-flow-seed.service -p MainPID --value)
parse_pid=$(systemctl show news-flow-parse.service -p MainPID --value)
systemctl stop news-flow-import.service
rollback(){ ln -sfn "$previous" /opt/news-flow/current; systemctl start news-flow-import.service; }
trap rollback ERR
ln -sfn "$release" /opt/news-flow/current
systemctl start news-flow-import.service
for name in seed parse import; do systemctl is-active --quiet "news-flow-$name.service"; done
test "$(systemctl show news-flow-seed.service -p MainPID --value)" = "$seed_pid"
test "$(systemctl show news-flow-parse.service -p MainPID --value)" = "$parse_pid"
systemctl show news-flow-seed.service news-flow-parse.service news-flow-import.service -p Id -p MainPID -p ActiveState -p SubState -p NRestarts
trap - ERR
rm -f -- "$upload_dir/.news-flow-release-20261113.tar.gz"
echo NEWS_ES_DEFAULT_MAPPING_READ_FIX_DEPLOYED
