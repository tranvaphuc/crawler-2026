set -euo pipefail
python3 - <<'PY'
from pathlib import Path
for name in ['apply_news_category_coverage.mjs','clean_news_category_false_positives.mjs']:
 for line in (Path('/opt/news-flow/current/scripts')/name).read_text().splitlines():
  if 'self_article' in line or 'news_category_hints SET state' in line:print(name+': '+line)
PY
