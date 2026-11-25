set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
systemctl stop news-category-hint-expansion-20261123
install -m 0644 "$upload_dir/.admit_news_category_backfill_20261123.mjs" "$base/scripts/admit_news_category_backfill_20261123.mjs"
install -m 0755 "$upload_dir/.run-news-category-hint-expansion-20261123.sh" /usr/local/libexec/run-news-category-hint-expansion-20261123.sh
sed -i 's/\r$//' /usr/local/libexec/run-news-category-hint-expansion-20261123.sh
/opt/news-flow/node/bin/node --check "$base/scripts/admit_news_category_backfill_20261123.mjs"
bash -n /usr/local/libexec/run-news-category-hint-expansion-20261123.sh
python3 - "$base" <<'PY'
from pathlib import Path
import sys
base=Path(sys.argv[1]);p=base/'scripts/apply_news_category_coverage.mjs';s=p.read_text();anchor='registerOriginalSources(db,registry);'
if 'db.exec(\'PRAGMA busy_timeout=20000\');'+anchor not in s:
 if s.count(anchor)!=1:raise RuntimeError('APPLY_TIMEOUT_ANCHOR_CHANGED')
 s=s.replace(anchor,"db.exec('PRAGMA busy_timeout=20000');"+anchor,1);tmp=p.with_name(p.name+'.busy.tmp');tmp.write_text(s);tmp.chmod(0o644);tmp.replace(p)
p=base/'scripts/clean_news_category_false_positives.mjs';s=p.read_text();old="live.exec('PRAGMA busy_timeout=5000')"
if old in s:
 s=s.replace(old,"live.exec('PRAGMA busy_timeout=20000')",1);tmp=p.with_name(p.name+'.busy.tmp');tmp.write_text(s);tmp.chmod(0o644);tmp.replace(p)
PY
systemd-run --unit=news-category-hint-expansion-20261123 --property=MemoryMax=3G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=48 --property=Restart=on-failure --property=RestartSec=30 --working-directory="$base" /usr/local/libexec/run-news-category-hint-expansion-20261123.sh
