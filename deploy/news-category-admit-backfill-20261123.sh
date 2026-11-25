set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
install -m 0644 "$upload_dir/.categoryBackfillAdmission.mjs" "$base/src/newsFlow/categoryBackfillAdmission.mjs"
install -m 0644 "$upload_dir/.admit_news_category_backfill_20261123.mjs" "$base/scripts/admit_news_category_backfill_20261123.mjs"
cd "$base"
/opt/news-flow/node/bin/node --check scripts/admit_news_category_backfill_20261123.mjs
/opt/news-flow/node/bin/node scripts/admit_news_category_backfill_20261123.mjs
