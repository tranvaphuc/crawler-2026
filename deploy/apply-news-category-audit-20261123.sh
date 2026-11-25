set -euo pipefail
cd /opt/news-flow/current
nice -n 10 /opt/news-flow/node/bin/node scripts/qualify_news_category_coverage.mjs
/opt/news-flow/node/bin/node scripts/clean_news_category_false_positives.mjs
/opt/news-flow/node/bin/node scripts/apply_news_category_coverage.mjs
