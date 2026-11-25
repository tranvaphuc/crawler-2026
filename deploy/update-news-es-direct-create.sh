#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
release=/opt/news-flow/releases/20261114-06
previous=$(readlink -f /opt/news-flow/current)
test "$previous" = /opt/news-flow/releases/20261114-05
test ! -e "$release"
install -d -o root -g root -m 755 "$release"
tar --extract --gzip --file "$upload_dir/.news-flow-release-20261113.tar.gz" --directory "$release" --no-same-owner
chown -R root:root "$release"
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
ln -s /etc/news-flow/news.env "$release/.env"
ln -s /var/lib/news-flow "$release/outputs"
export PATH=/opt/news-flow/node/bin:$PATH
for unchanged in package.json src/newsFlow/state.mjs src/newsFlow/transport.mjs src/newsFlow/identity.mjs src/newsFlow/threeFlowRuntime.mjs src/newsFlow/threeFlowProcessor.mjs src/newsFlow/threeFlowReview.mjs; do cmp -s "$previous/$unchanged" "$release/$unchanged"; done
ln -s "$previous/node_modules" "$release/node_modules"
install -o root -g root -m 644 "$previous/package-lock.json" "$release/package-lock.json"
if ! runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; npm test > /var/lib/news-flow/es-direct-create-tests.tap 2>&1"; then
 tail -n 80 /var/lib/news-flow/es-direct-create-tests.tap
 exit 1
fi
tail -n 9 /var/lib/news-flow/es-direct-create-tests.tap
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
echo NEWS_ES_DIRECT_CREATE_DEPLOYED
