set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node scripts/clean_news_category_false_positives.mjs
