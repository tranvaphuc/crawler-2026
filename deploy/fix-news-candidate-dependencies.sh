#!/usr/bin/env bash
set -euo pipefail
release=/opt/news-flow/releases/20261115-03
previous=/opt/news-flow/releases/20261115-02
canonical=$(readlink -f "$previous/node_modules")
test -d "$canonical/cheerio"
test -L "$release/node_modules"
ln -sfn "$canonical" "$release/node_modules"
test -f "$release/node_modules/cheerio/package.json"
printf 'CANDIDATE_DEPENDENCIES_RESOLVED=%s\n' "$canonical"
