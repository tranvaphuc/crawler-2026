set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
previous=$(readlink -f /opt/news-flow/current)
release=/opt/news-flow/releases/20261116-suckhoecong-user-utc7-03
test "$previous" = /opt/news-flow/releases/20261116-suckhoecong-time-01
test ! -e "$release"
stage=$(mktemp -d /var/lib/news-flow/suckhoecong-user-utc7.XXXXXX)
tar -xzf "$upload_dir/.suckhoecong-user-utc7.tar.gz" -C "$stage"
python3 - "$previous" "$stage" <<'PY'
import pathlib,sys,json,hashlib
p,s=map(pathlib.Path,sys.argv[1:]);m=json.loads((s/'manifest.json').read_text())
assert hashlib.sha256((p/'src/web/newsStrictPublication.mjs').read_text().encode()).hexdigest()==m['baselineStrict'],'LIVE_STRICT_CHANGED'
for name,sha in m['files'].items():assert hashlib.sha256((s/name).read_bytes()).hexdigest()==sha,'PACKAGE_HASH_MISMATCH'
PY
cp -a "$previous" "$release"
python3 - "$release" "$stage" <<'PY'
import pathlib,sys,json,shutil
r,s=map(pathlib.Path,sys.argv[1:]);m=json.loads((s/'manifest.json').read_text())
for name in m['files']:
 p=r/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(s/name,p);p.chmod(0o644)
p=r/'config/web-sources/news/suckhoecong.vn.json';c=json.loads(p.read_text())
(s/'source-before.json').write_text(json.dumps(c,ensure_ascii=False,indent=2))
c.pop('originalPublicationBlockedReason',None)
c['timezone']='Asia/Ho_Chi_Minh';c['publicationTimePolicy']='user_confirmed_suckhoecong_utc_plus_7'
c['timezoneProvenance']={'authority':'explicit_user_confirmation','date':'2026-11-16','utcOffset':'+07:00','scope':'suckhoecong.vn'}
c['publicationEvidencePolicy']={'kind':'suckhoecong_owned_local_clock_v1'}
c['publishedDate']={'strategy':'selector','selector':'section.box-author .info-author > ul > li:first-child','precision':'minute','timezone':'Asia/Ho_Chi_Minh'}
for v in c.get('variants',[]):v['publishedDate']=dict(c['publishedDate'])
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
PY
cd "$release"
/opt/news-flow/node/bin/node --test test/news-suckhoecong-time.test.mjs test/news-strict-publication.test.mjs > "$stage/tests.tap" 2>&1 || { tail -n 40 "$stage/tests.tap"; exit 1; }
tail -n 9 "$stage/tests.tap"
/opt/news-flow/node/bin/node --input-type=module <<'JS'
import fs from 'node:fs/promises';
import {parseConfiguredArticle} from './src/web/configurableNewsParser.mjs';
import {toEs5News} from './src/newsFlow/identity.mjs';
const url='https://suckhoecong.vn/nguyen-nhan-viem-hong-keo-dai-va-cach-khac-phuc-trieu-chung-viem-hong-d104794.html';
const c=JSON.parse(await fs.readFile('config/web-sources/news/suckhoecong.vn.json','utf8'));c.publicationValidationPolicy='strict_native_publication_v1';
const p=parseConfiguredArticle(await fs.readFile('diagnostics/suckhoecong-time/article-104794.html','utf8'),url,c);
if(p.error)throw Error(p.error);const doc=toEs5News(p,c);if(doc._source.publishedDate!=='2026-11-16T02:49:00.000Z')throw Error('TIME_MISMATCH');
console.log(JSON.stringify({verifiedTarget:doc._id,index:doc._index,utc:doc._source.publishedDate,proof:p.extracted.publicationProof.source}));
JS
python3 - "$stage" <<'PY'
import pathlib,sys,sqlite3,json
d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True)
pathlib.Path(sys.argv[1],'ai-before.json').write_text(json.dumps(d.execute('SELECT * FROM ai_usage ORDER BY day').fetchall()))
PY
ln -s "$release" /opt/news-flow/current.suckhoecong-utc7
mv -Tf /opt/news-flow/current.suckhoecong-utc7 /opt/news-flow/current
systemctl restart news-flow-seed.service news-flow-parse.service
systemctl start news-flow-import.service
systemctl is-active news-flow-seed.service news-flow-parse.service news-flow-import.service
python3 - "$stage" <<'PY'
import pathlib,sys,sqlite3,json
d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True)
b=json.loads(pathlib.Path(sys.argv[1],'ai-before.json').read_text());a=d.execute('SELECT * FROM ai_usage ORDER BY day').fetchall()
assert all(any(x[0]==y[0] and x[1]>=y[1] and x[2]+1e-9>=y[2] for x in a) for y in b)
print('AI_LEDGER_BUDGET_AND_CALL_LIMIT_PRESERVED_NO_PAID_AI_CALLS')
print('IMPORT_RECEIPTS_PRESERVED',d.execute("SELECT count(*) FROM import_receipts WHERE url LIKE 'https://suckhoecong.vn/%'").fetchone()[0])
PY
echo USER_CONFIRMED_UTC7_DEPLOYED_NO_ARTICLES_REQUEUED_YET
