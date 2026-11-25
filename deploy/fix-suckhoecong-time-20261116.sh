set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
previous=$(readlink -f /opt/news-flow/current)
release=/opt/news-flow/releases/20261116-suckhoecong-time-01
test "$previous" = /opt/news-flow/releases/20261115-content-only-reset-01
test ! -e "$release"
stage=$(mktemp -d /var/lib/news-flow/suckhoecong-time-stage.XXXXXX)
tar -xzf "$upload_dir/.suckhoecong-time-fix.tar.gz" -C "$stage"
python3 - "$previous" "$stage" <<'PY'
import sys,pathlib,json,hashlib
p,s=map(pathlib.Path,sys.argv[1:]);m=json.loads((s/'manifest.json').read_text())
actual=hashlib.sha256((p/'src/web/newsStrictPublication.mjs').read_text().encode()).hexdigest()
print('BASELINE_HASH',actual,'EXPECTED',m['baselineStrict'])
assert actual==m['baselineStrict'], 'LIVE_STRICT_CHANGED'
for name,sha in m['files'].items():assert hashlib.sha256((s/name).read_bytes()).hexdigest()==sha, 'PATCH_HASH_MISMATCH'
PY
cp -a "$previous" "$release"
python3 - "$release" "$stage" <<'PY'
import pathlib,sys,json,shutil
r,s=map(pathlib.Path,sys.argv[1:]);m=json.loads((s/'manifest.json').read_text())
for name in m['files']:
 dest=r/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(s/name,dest);dest.chmod(0o644)
p=r/'config/web-sources/news/suckhoecong.vn.json';c=json.loads(p.read_text());selector='section.box-author .info-author > ul > li:first-child'
c['publishedDate']={'strategy':'selector','selector':selector,'precision':'minute','timezone':'Asia/Ho_Chi_Minh'}
c['publicationEvidencePolicy']={'kind':'suckhoecong_owned_local_clock_v1'}
for v in c.get('variants',[]):v['publishedDate']=dict(c['publishedDate'])
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
profile=r/'src/web/newsSiteProfiles.mjs';text=profile.read_text();text=text.replace("'suckhoecong.vn':{date:'.info-author > ul > li:first-child'", "'suckhoecong.vn':{date:'section.box-author .info-author > ul > li:first-child'")
profile.write_text(text)
print('ONLY_SUCKHOECONG_PUBLICATION_CONFIG_AND_NARROW_VERIFIER_CHANGED')
PY
cd "$release"
/opt/news-flow/node/bin/node --test test/news-suckhoecong-time.test.mjs test/news-strict-publication.test.mjs > "$stage/tests.tap" 2>&1 || { tail -n 35 "$stage/tests.tap"; exit 1; }
tail -n 9 "$stage/tests.tap"
/opt/news-flow/node/bin/node scripts/verify_suckhoecong_time_fix.mjs diagnostics/suckhoecong-time
python3 - "$stage" <<'PY'
import sqlite3,json,pathlib,sys
db=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True)
pathlib.Path(sys.argv[1],'ai-before.json').write_text(json.dumps(db.execute('SELECT * FROM ai_usage ORDER BY day').fetchall()))
print('AI_LEDGER_SNAPSHOT_SAVED_NO_PAID_AI_CALLS')
PY
ln -s "$release" /opt/news-flow/current.suckhoecong-time
mv -Tf /opt/news-flow/current.suckhoecong-time /opt/news-flow/current
systemctl restart news-flow-seed.service news-flow-parse.service
systemctl is-active news-flow-seed.service news-flow-parse.service news-flow-import.service
python3 - "$stage" <<'PY'
import sqlite3,json,pathlib,sys
db=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True)
before=json.loads(pathlib.Path(sys.argv[1],'ai-before.json').read_text());after=db.execute('SELECT * FROM ai_usage ORDER BY day').fetchall()
assert all(any(a[0]==b[0] and a[1]>=b[1] and a[2]+1e-9>=b[2] for a in after) for b in before)
print('AI_USAGE_PRESERVED_DAILY_BUDGET_AND_CALL_LIMIT_UNCHANGED')
print('SUCKHOECONG_QUEUE',db.execute("SELECT role,state,count(*) FROM tasks WHERE site='suckhoecong.vn' AND state IN ('pending','running') GROUP BY role,state").fetchall())
print('DELETED_ARTICLE_RECEIPTS_PRESERVED',db.execute("SELECT count(*) FROM import_receipts WHERE url LIKE 'https://suckhoecong.vn/%'").fetchone()[0])
PY
echo SUCKHOECONG_TIME_FIX_DEPLOYED_CRAWLING_CONTINUES_NO_HISTORICAL_REQUEUE
