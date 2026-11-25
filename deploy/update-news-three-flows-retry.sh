#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
release=/opt/news-flow/releases/20261113-23
previous=$(readlink -f /opt/news-flow/current)
test "$previous" = /opt/news-flow/releases/20261113-21
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
for name in seed parse import; do install -o root -g root -m 644 "$upload_dir/.news-flow-$name.service" "/etc/systemd/system/news-flow-$name.service"; done
install -o root -g news-flow -m 640 "$upload_dir/.news-flow-ai.env" /etc/news-flow/ai.env
systemd-analyze verify /etc/systemd/system/news-flow-seed.service /etc/systemd/system/news-flow-parse.service /etc/systemd/system/news-flow-import.service
systemctl daemon-reload
rollback(){ systemctl stop news-flow-seed.service news-flow-parse.service news-flow-import.service || true; systemctl disable news-flow-seed.service news-flow-parse.service news-flow-import.service || true; ln -sfn "$previous" /opt/news-flow/current; systemctl enable news-flow.service news-flow-writer.service; systemctl start news-flow-writer.service news-flow.service; }
trap rollback ERR
systemctl stop news-flow.service news-flow-writer.service
test "$(systemctl show news-flow.service -p MainPID --value)" = 0
test "$(systemctl show news-flow-writer.service -p MainPID --value)" = 0
test -s /var/lib/news-flow/backups/write-before-three-flows-20261113.sqlite
echo EXISTING_SQLITE_BACKUP_PRESERVED
runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; node --max-old-space-size=512 scripts/run_news_three_flow.mjs migrate"
ln -sfn "$release" /opt/news-flow/current
systemctl start news-flow-import.service news-flow-parse.service news-flow-seed.service
for name in seed parse import; do systemctl is-active --quiet "news-flow-$name.service"; done
systemctl disable news-flow.service news-flow-writer.service
systemctl enable news-flow-seed.service news-flow-parse.service news-flow-import.service
systemctl show news-flow-seed.service news-flow-parse.service news-flow-import.service -p Id -p MainPID -p ActiveState -p SubState -p NRestarts -p WatchdogUSec
trap - ERR
rm -f -- "$upload_dir/.news-flow-release-20261113.tar.gz" "$upload_dir/.news-flow-ai.env" "$upload_dir/.news-flow-seed.service" "$upload_dir/.news-flow-parse.service" "$upload_dir/.news-flow-import.service"
echo NEWS_THREE_FLOWS_DEPLOYED_AI_PENDING_CREDENTIAL
