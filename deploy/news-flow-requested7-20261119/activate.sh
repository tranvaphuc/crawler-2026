set -eu
old=/opt/news-flow/releases/20261117-held-article-fixes-11
new=/opt/news-flow/releases/20261119-requested7-fixes-01
[ "$(readlink -f /opt/news-flow/current)" = "$old" ]
python3 - "$new" <<'PY'
import json,pathlib,sys,hashlib
new=pathlib.Path(sys.argv[1]);m=json.loads((new/'requested7-manifest.json').read_text())
for r in m['files']: assert hashlib.sha256((new/r['file']).read_bytes()).hexdigest()==r['after'],r['file']
r=json.loads(pathlib.Path('/var/lib/news-flow/requested7-20261119/qualification/live-qualification.json').read_text())
assert len(r['results'])==7 and all(x.get('state')=='done' and x.get('reason')=='verified_outbox' for x in r['results']),'Live qualification incomplete'
assert '# fail 0' in pathlib.Path('/var/lib/news-flow/requested7-20261119/staged-tests.tap').read_text(errors='replace')
print('PRE_ACTIVATION_VERIFIED')
PY
cat > /var/lib/news-flow/requested7-20261119/rollback.sh <<'ROLLBACK'
#!/bin/bash
set -eu
systemctl stop news-flow-seed.service news-flow-parse.service news-flow-import.service
ln -s /opt/news-flow/releases/20261117-held-article-fixes-11 /opt/news-flow/current.requested7-rollback
mv -Tf /opt/news-flow/current.requested7-rollback /opt/news-flow/current
systemctl start news-flow-import.service news-flow-parse.service news-flow-seed.service
ROLLBACK
chmod 700 /var/lib/news-flow/requested7-20261119/rollback.sh
rollback_on_error(){ /var/lib/news-flow/requested7-20261119/rollback.sh; }
trap rollback_on_error ERR
systemctl stop news-flow-seed.service news-flow-parse.service news-flow-import.service
ln -s "$new" /opt/news-flow/current.requested7-next
mv -Tf /opt/news-flow/current.requested7-next /opt/news-flow/current
systemctl start news-flow-import.service news-flow-parse.service news-flow-seed.service
for service in news-flow-import news-flow-parse news-flow-seed; do systemctl is-active --quiet "$service"; done
trap - ERR
printf 'ACTIVE_RELEASE\n'
readlink -f /opt/news-flow/current
systemctl show news-flow-seed news-flow-parse news-flow-import -p Id -p ActiveState -p MainPID -p ExecMainStartTimestamp -p NRestarts
printf 'DEPLOYED_AT\n'
date -Is
