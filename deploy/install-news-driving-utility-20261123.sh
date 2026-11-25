set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
stage=/var/lib/news-flow/driving-utility-20261123
install -d -m 0755 "$stage"
python3 - "$upload_dir" "$base" "$stage" <<'PY'
import json,sys,shutil
from pathlib import Path
u,b,stage=map(Path,sys.argv[1:]);delta=json.loads((u/'.news-driving-utility-delta-20261123.json').read_text());shutil.copytree(b/'src',stage/'src',dirs_exist_ok=True);shutil.copytree(b/'test',stage/'test',dirs_exist_ok=True)
for name in ['node_modules','config','scripts']:
 if not (stage/name).exists():(stage/name).symlink_to(b/name,target_is_directory=True)
shutil.copyfile(b/'package.json',stage/'package.json');f=stage/delta['path'];s=f.read_text()
if s.count(delta['before'])!=1:raise RuntimeError('DRIVING_POLICY_BASELINE_CHANGED')
f.write_text(s.replace(delta['before'],delta['after'],1));(stage/'test/news-driving-utility.test.mjs').write_text((u/'.news-driving-utility-test-20261123.mjs').read_text())
PY
cd "$stage"
/opt/news-flow/node/bin/node --test test/news-driving-utility.test.mjs test/news-link-policy.test.mjs test/news-three-flow.test.mjs test/news-live-priority.test.mjs test/news-discovery-health.test.mjs test/news-category-coverage.test.mjs test/news-category-reviewed-recovery.test.mjs test/news-category-hint-frontier.test.mjs test/news-category-checkpoint.test.mjs test/news-category-import-reconciliation.test.mjs test/news-category-backfill-admission.test.mjs > tests.tap 2>&1 || { tail -n 80 tests.tap; exit 1; }
tail -n 9 tests.tap
resume_feedback() {
 if ! systemctl is-active --quiet news-category-hint-expansion-20261123; then
  systemctl start news-category-hint-expansion-20261123 2>/dev/null || systemd-run --unit=news-category-hint-expansion-20261123 --property=MemoryMax=3G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=32 --property=Restart=on-failure --property=RestartSec=30 --working-directory="$base" /usr/local/libexec/run-news-category-hint-expansion-20261123.sh
 fi
}
resume_review() {
 if ! systemctl is-active --quiet news-category-transient-review-20261123; then
  systemctl start news-category-transient-review-20261123 2>/dev/null || systemd-run --unit=news-category-transient-review-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=3G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=32 --property=Restart=on-failure --property=RestartSec=30 --property=TimeoutStopSec=60 --setenv=NEWS_CATEGORY_REVIEW_APPLY=1 --working-directory="$base" /opt/news-flow/node/bin/node scripts/recheck_news_category_transients_v2.mjs
 fi
}
cleanup() {
 systemctl start news-flow-seed news-flow-parse
 resume_review
 resume_feedback
 for service in news-flow-seed news-flow-parse; do rm -f "/run/systemd/system/$service.service.d/driving-policy-drain-20261123.conf"; done
 systemctl daemon-reload
}
trap cleanup EXIT
systemctl stop news-category-hint-expansion-20261123
systemctl stop news-category-transient-review-20261123
python3 - "$upload_dir" "$base" "$stage" <<'PY'
from pathlib import Path
import json,sys,shutil
u,b,stage=map(Path,sys.argv[1:]);delta=json.loads((u/'.news-driving-utility-delta-20261123.json').read_text());f=b/delta['path'];s=f.read_text()
if s.count(delta['before'])!=1:raise RuntimeError('DRIVING_POLICY_CONCURRENT_CHANGE')
shutil.copy2(f,stage/'newsLinkPolicy.before.mjs');q=f.with_name(f.name+'.driving-new');q.write_text(s.replace(delta['before'],delta['after'],1));shutil.copystat(f,q);q.replace(f)
f=b/'scripts/recheck_news_category_transients_v2.mjs';s=f.read_text();old="verified?'verified':'unconfirmed',result.reason";new="verified?'verified':result.reason?.startsWith('non_article:')?'excluded':'unconfirmed',result.reason"
if s.count(old)!=1:raise RuntimeError('REVIEW_OUTCOME_ANCHOR_CHANGED')
shutil.copy2(f,stage/'review.before.mjs');f.write_text(s.replace(old,new));(b/'test/news-driving-utility.test.mjs').write_text((u/'.news-driving-utility-test-20261123.mjs').read_text());shutil.copyfile(stage/'tests.tap','/var/lib/news-flow/live-priority-20261123/combined-tests.tap');print('DRIVING_UTILITY_POLICY_INSTALLED')
PY
for service in news-flow-seed news-flow-parse; do
 install -d -m 0755 "/run/systemd/system/$service.service.d"
 printf '[Service]\nTimeoutStopSec=180\n' > "/run/systemd/system/$service.service.d/driving-policy-drain-20261123.conf"
done
systemctl daemon-reload
systemctl stop news-flow-seed news-flow-parse
systemctl start news-flow-seed news-flow-parse
resume_review
resume_feedback
systemctl is-active news-flow-seed news-flow-parse news-flow-import news-category-transient-review-20261123 news-category-hint-expansion-20261123
