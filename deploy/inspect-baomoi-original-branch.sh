set -euo pipefail
readlink -f /opt/news-flow/current
systemctl is-active news-flow-seed news-flow-parse news-flow-import
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
tar -czf "$upload_dir/.baomoi-original-baseline.tgz" -C /opt/news-flow/current src/newsFlow/registry.mjs src/newsFlow/processor.mjs src/newsFlow/threeFlowRuntime.mjs scripts/run_news_three_flow.mjs
chown "$SUDO_USER" "$upload_dir/.baomoi-original-baseline.tgz"
chmod 600 "$upload_dir/.baomoi-original-baseline.tgz"
python3 - <<'PY'
import sqlite3,json
env={}
for line in open('/etc/news-flow/ai.env'):
 if '=' in line:
  k,v=line.strip().split('=',1)
  if k in ('AI_DAILY_BUDGET_USD','AI_DAILY_MAX_CALLS'):env[k]=v
c=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True)
print(json.dumps({'budget':env,'ai_usage':c.execute('SELECT * FROM ai_usage ORDER BY day DESC LIMIT 3').fetchall(),'baomoi_links':c.execute("SELECT count(*) FROM article_links WHERE site='baomoi.com'").fetchone()[0]}))
PY
