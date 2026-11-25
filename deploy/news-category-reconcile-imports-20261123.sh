set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -m 0644 "$upload_dir/.reconcile_news_category_imports.mjs" /opt/news-flow/current/scripts/reconcile_news_category_imports.mjs
install -m 0644 "$upload_dir/.categoryImportReconciliation.mjs" /opt/news-flow/current/src/newsFlow/categoryImportReconciliation.mjs
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --check scripts/reconcile_news_category_imports.mjs
/opt/news-flow/node/bin/node scripts/reconcile_news_category_imports.mjs
/opt/news-flow/node/bin/node scripts/reconcile_news_category_imports.mjs --apply
