set -euo pipefail
base=$(readlink -f /opt/news-flow/current)
resume() {
 if ! systemctl is-active --quiet news-category-audit-20261123; then
  systemctl start news-category-audit-20261123 2>/dev/null || systemd-run --unit=news-category-audit-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=5G --property=CPUQuota=300% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=100 --working-directory="$base" /opt/news-flow/node/bin/node --max-old-space-size=1024 scripts/audit_news_category_coverage.mjs
 fi
 if ! systemctl is-active --quiet news-category-hint-expansion-20261123; then
  systemctl start news-category-hint-expansion-20261123 2>/dev/null || systemd-run --unit=news-category-hint-expansion-20261123 --property=MemoryMax=3G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=32 --property=Restart=on-failure --property=RestartSec=30 --working-directory="$base" /usr/local/libexec/run-news-category-hint-expansion-20261123.sh
 fi
}
trap resume EXIT
systemctl stop news-category-hint-expansion-20261123
systemctl stop news-category-audit-20261123
python3 - "$base" <<'PY'
import json,sqlite3,time,sys,shutil
from pathlib import Path
b=Path(sys.argv[1]);f=b/'scripts/audit_news_category_coverage.mjs';s=f.read_text();old='siteLimit=site=>Math.min(2,Math.max(1,Number(registry.sources.get(site)?.config.http?.maxConcurrentSeeds)||2))';new='siteLimit=site=>{const available=prioritySites.length<=3?8:2;return Math.min(available,Math.max(1,Number(registry.sources.get(site)?.config.http?.maxConcurrentSeeds)||available));}'
if s.count(old)!=1:raise RuntimeError('AUDIT_SLOT_BASELINE_CHANGED')
shutil.copy2(f,'/var/lib/news-flow/category-coverage-20261123/audit-before-adaptive-slots.mjs');f.write_text(s.replace(old,new))
d=sqlite3.connect('file:/var/lib/news-flow/category-coverage-20261123/audit.sqlite?mode=ro',uri=True)
r={'at':int(time.time()*1000),'checked':d.execute("SELECT count(*) FROM pages WHERE site='quochoi.vn' AND state='done'").fetchone()[0],'recent':d.execute("SELECT status,error,count(*) FROM pages WHERE site='quochoi.vn' AND state='done' AND checked_at>? GROUP BY 1,2",[int(time.time()*1000)-600000]).fetchall()};Path('/var/lib/news-flow/category-coverage-20261123/adaptive-slots-baseline.json').write_text(json.dumps(r));print(json.dumps(r))
PY
resume
systemctl is-active news-flow-seed news-flow-parse news-flow-import news-category-audit-20261123
