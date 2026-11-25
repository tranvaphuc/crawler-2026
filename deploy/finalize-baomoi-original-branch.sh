set -euo pipefail
cd /opt/news-flow/current
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -m 644 "$upload_dir/.verify-baomoi-original.mjs" scripts/verify_baomoi_original_branch.mjs
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/verify_baomoi_original_branch.mjs
systemctl show news-flow-baomoi-original.service -p NRestarts -p ActiveState
python3 - <<'PY'
import sqlite3,json,datetime
c=sqlite3.connect('/var/lib/news-flow/news-flow-runtime/write.sqlite',timeout=30)
c.execute('BEGIN IMMEDIATE')
key='baomoi_original_branch_20261120'
d=json.loads(c.execute('SELECT value FROM flow_meta WHERE key=?',(key,)).fetchone()[0]);d.update(implementationStatus='complete',oneOffAuthorizationStatus='closed_unused',additionalPaidAiCalls=0,completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
c.execute('UPDATE flow_meta SET value=? WHERE key=?',(json.dumps(d),key));c.commit()
print(json.dumps({'oneOffAuthorizationStatus':d['oneOffAuthorizationStatus'],'regularDailyBudgetUsd':2,'paidAiCalls':0}))
print(json.dumps({'dynamicSeeds':c.execute("SELECT site,status,links_found,new_links FROM seed_sources WHERE site IN ('xahoi.congly.vn','petrovietnam.petrotimes.vn')").fetchall()}))
PY
cp /var/lib/news-flow/baomoi-original-branch-20261120/live-verification.json "$upload_dir/.original-branch-final.json"
chown "$SUDO_USER" "$upload_dir/.original-branch-final.json"
chmod 600 "$upload_dir/.original-branch-final.json"
