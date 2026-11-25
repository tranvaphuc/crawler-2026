#!/usr/bin/env bash
set -euo pipefail
umask 077
test "$(id -u)" = 0
if ! id news-flow >/dev/null 2>&1; then useradd --system --user-group --home-dir /var/lib/news-flow --create-home --shell /usr/sbin/nologin news-flow; fi
install -d -o root -g root -m 755 /opt/news-flow /opt/news-flow/releases
install -d -o root -g news-flow -m 750 /etc/news-flow
install -d -o news-flow -g news-flow -m 750 /var/lib/news-flow /var/lib/news-flow/news-flow-runtime /var/lib/news-flow/news-flow-build-2026-11-12
stage=$(mktemp -d /opt/news-flow/node-stage.XXXXXX)
trap 'rm -rf -- "$stage"' EXIT
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$stage/SHASUMS256.txt"
file=$(awk '$2 ~ /^node-v22\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ {print $2}' "$stage/SHASUMS256.txt")
test -n "$file"
test "$(printf '%s\n' "$file" | wc -l)" = 1
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/latest-v22.x/$file" -o "$stage/$file"
(cd "$stage"; grep -F "  $file" SHASUMS256.txt | sha256sum --check --status)
version=${file%-linux-x64.tar.xz}
if [ ! -d "/opt/news-flow/$version" ]; then tar -xJf "$stage/$file" -C /opt/news-flow; mv "/opt/news-flow/${file%.tar.xz}" "/opt/news-flow/$version"; fi
ln -sfn "$version" /opt/news-flow/node
/opt/news-flow/node/bin/node --version
echo NEWS_RUNTIME_INSTALLED
