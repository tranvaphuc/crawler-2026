set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
python3 - "$upload_dir/.category-maintenance-checkpoint.tar.gz" "$base" <<'PY'
import tarfile,sys
from pathlib import Path
with tarfile.open(sys.argv[1]) as t:
 for name in ['src/newsFlow/categoryCoverage.mjs','src/newsFlow/categoryAuditCheckpoint.mjs','scripts/audit_news_category_coverage.mjs','scripts/qualify_news_category_originals.mjs','scripts/report_news_category_coverage.py','test/news-category-coverage.test.mjs','test/news-category-checkpoint.test.mjs']:
  dst=Path(sys.argv[2])/name;tmp=dst.with_name(dst.name+'.category-checkpoint.tmp');tmp.write_bytes(t.extractfile(name).read());tmp.chmod(0o644);tmp.replace(dst)
 dst=Path('/usr/local/libexec/run-news-category-maintenance.sh');tmp=dst.with_name(dst.name+'.category-checkpoint.tmp');tmp.write_bytes(t.extractfile('deploy/run-news-category-maintenance.sh').read().replace(b'\r\n',b'\n'));tmp.chmod(0o755);tmp.replace(dst)
PY
cd "$base"
/opt/news-flow/node/bin/node --check scripts/audit_news_category_coverage.mjs
/opt/news-flow/node/bin/node --check scripts/qualify_news_category_originals.mjs
bash -n /usr/local/libexec/run-news-category-maintenance.sh
/opt/news-flow/node/bin/node --test test/news-category-checkpoint.test.mjs test/news-category-coverage.test.mjs test/news-discovery-health.test.mjs > /var/lib/news-flow/category-coverage-20261123/maintenance-tests.tap 2>&1
tail -n 10 /var/lib/news-flow/category-coverage-20261123/maintenance-tests.tap
systemctl is-enabled news-category-maintenance.timer
systemctl list-timers news-category-maintenance.timer --no-pager
if systemctl is-active --quiet news-category-audit-20261123; then
 systemctl stop news-category-audit-20261123
 if ! systemctl start news-category-audit-20261123 2>/dev/null; then
  systemd-run --unit=news-category-audit-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=5G --property=CPUQuota=300% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=100 --working-directory="$base" /opt/news-flow/node/bin/node --max-old-space-size=1024 scripts/audit_news_category_coverage.mjs
 fi
fi
