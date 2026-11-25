#!/bin/bash
set -euo pipefail
# The initial full traversal owns coverage until it has finished. Later runs
# review fresh menu/breadcrumb hints captured by the existing three flows.
if systemctl is-active --quiet news-category-audit-20261123.service; then exit 0; fi
if systemctl is-active --quiet news-category-initial-backfill-20261123.service; then exit 0; fi
if systemctl is-active --quiet news-category-hint-expansion-20261123.service; then exit 0; fi
if systemctl is-active --quiet news-category-transient-review-20261123.service; then exit 0; fi
if systemctl is-active --quiet news-category-finalize-20261123.service; then exit 0; fi
export NEWS_CATEGORY_AUDIT_ROOT=/var/lib/news-flow/category-maintenance/persistent
export NEWS_CATEGORY_HINTS_ONLY=1
install -d -o news-flow -g news-flow -m 0750 "$NEWS_CATEGORY_AUDIT_ROOT"
cd /opt/news-flow/current
if [ -f "$NEWS_CATEGORY_AUDIT_ROOT/audit.sqlite" ]; then
 /opt/news-flow/node/bin/node scripts/qualify_news_category_coverage.mjs
 /opt/news-flow/node/bin/node scripts/clean_news_category_false_positives.mjs
 /opt/news-flow/node/bin/node scripts/apply_news_category_coverage.mjs
fi
runuser -u news-flow -- /opt/news-flow/node/bin/node --max-old-space-size=1024 scripts/audit_news_category_coverage.mjs
/opt/news-flow/node/bin/node scripts/qualify_news_category_coverage.mjs
/opt/news-flow/node/bin/node scripts/clean_news_category_false_positives.mjs
/opt/news-flow/node/bin/node scripts/apply_news_category_coverage.mjs
