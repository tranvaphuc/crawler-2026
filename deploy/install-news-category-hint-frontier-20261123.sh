set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
systemctl stop news-category-finalize-20261123 2>/dev/null || true
python3 - "$upload_dir/.category-hint-frontier.tar.gz" "$base" <<'PY'
import tarfile,sys
from pathlib import Path
with tarfile.open(sys.argv[1]) as t:
 for name in ['src/newsFlow/categoryHintFrontier.mjs','scripts/ingest_news_category_hints_20261123.mjs','scripts/report_news_category_coverage.py','test/news-category-hint-frontier.test.mjs']:
  dst=Path(sys.argv[2])/name;temp=dst.with_name(dst.name+'.hint-frontier.tmp');temp.write_bytes(t.extractfile(name).read());temp.chmod(0o644);temp.replace(dst)
 for name in ['run-news-category-hint-expansion-20261123.sh','run-news-category-finalize-20261123.sh','run-news-category-maintenance.sh']:
  dst=Path('/usr/local/libexec')/name;temp=dst.with_name(dst.name+'.hint-frontier.tmp');temp.write_bytes(t.extractfile('deploy/'+name).read().replace(b'\r\n',b'\n'));temp.chmod(0o755);temp.replace(dst)
PY
cd "$base"
/opt/news-flow/node/bin/node --test test/news-category-hint-frontier.test.mjs test/news-category-checkpoint.test.mjs test/news-category-coverage.test.mjs > /var/lib/news-flow/category-coverage-20261123/hint-frontier-tests.tap 2>&1
tail -n 10 /var/lib/news-flow/category-coverage-20261123/hint-frontier-tests.tap
bash -n /usr/local/libexec/run-news-category-hint-expansion-20261123.sh
bash -n /usr/local/libexec/run-news-category-finalize-20261123.sh
bash -n /usr/local/libexec/run-news-category-maintenance.sh
systemd-run --unit=news-category-hint-expansion-20261123 --property=MemoryMax=3G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=48 --property=Restart=on-failure --property=RestartSec=30 --working-directory="$base" /usr/local/libexec/run-news-category-hint-expansion-20261123.sh
if ! systemctl start news-category-finalize-20261123 2>/dev/null; then
 systemd-run --unit=news-category-finalize-20261123 --property=MemoryMax=3G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=32 --property=Restart=on-failure --property=RestartSec=120 --setenv="NEWS_CATEGORY_EXPORT_USER=$SUDO_USER" --working-directory="$base" /usr/local/libexec/run-news-category-finalize-20261123.sh
fi
systemctl is-active news-category-hint-expansion-20261123 news-category-finalize-20261123
