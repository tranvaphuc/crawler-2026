#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
release=/opt/news-flow/releases/20261113-24
previous=$(readlink -f /opt/news-flow/current)
test "$previous" = /opt/news-flow/releases/20261113-23
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
writer_pid=$(systemctl show news-flow-import.service -p MainPID --value)
install -o root -g root -m 600 /etc/news-flow/ai.env /var/lib/news-flow/diagnostics/news-ai-before-enable.env
systemctl stop news-flow-seed.service news-flow-parse.service
rollback(){ install -o root -g news-flow -m 640 /var/lib/news-flow/diagnostics/news-ai-before-enable.env /etc/news-flow/ai.env; ln -sfn "$previous" /opt/news-flow/current; systemctl start news-flow-seed.service news-flow-parse.service; }
trap rollback ERR
install -o root -g news-flow -m 640 "$upload_dir/.news-flow-ai.env" /etc/news-flow/ai.env
ln -sfn "$release" /opt/news-flow/current
systemctl start news-flow-seed.service news-flow-parse.service
for name in seed parse import; do systemctl is-active --quiet "news-flow-$name.service"; done
test "$(systemctl show news-flow-import.service -p MainPID --value)" = "$writer_pid"
systemctl show news-flow-seed.service news-flow-parse.service news-flow-import.service -p Id -p MainPID -p ActiveState -p SubState -p NRestarts
trap - ERR
rm -f -- "$upload_dir/.news-flow-release-20261113.tar.gz" "$upload_dir/.news-flow-ai.env"
echo NEWS_AI_AUTH_FIXED_AND_ENABLED_EXISTING_KEY
