set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
previous=$(readlink -f /opt/news-flow/current)
release=/opt/news-flow/releases/20261119-baomoi-media-06
test "$previous" = /opt/news-flow/releases/20261119-stability-feed-05
test ! -e "$release"
stage=$(mktemp -d /var/lib/news-flow/baomoi-media-stage.XXXXXX)
tar -xzf "$upload_dir/.baomoi-patch.tar.gz" -C "$stage"
python3 - "$previous" "$stage" <<'PY'
import pathlib,hashlib,json,sys
p,s=map(pathlib.Path,sys.argv[1:]);m=json.loads((s/'manifest.json').read_text())
assert hashlib.sha256((p/'src/web/configurableNewsParser.mjs').read_bytes()).hexdigest()==m['baselineParser'], 'LIVE_PARSER_CHANGED'
assert hashlib.sha256((p/'config/web-sources/news/baomoi.com.json').read_bytes()).hexdigest()==m['baselineConfig'], 'LIVE_CONFIG_CHANGED'
for name,sha in m['files'].items():assert hashlib.sha256((s/name).read_bytes()).hexdigest()==sha,name
PY
cp -a "$previous" "$release"
python3 - "$release" "$stage" <<'PY'
import pathlib,json,sys,shutil
r,s=map(pathlib.Path,sys.argv[1:]);m=json.loads((s/'manifest.json').read_text())
for name in m['files']:
 p=r/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(s/name,p);p.chmod(0o644)
p=r/'src/web/configurableNewsParser.mjs';t=p.read_text();anchor=' const dom=native?.html||restoredClock?cheerio.load(html):options.dom||cheerio.load(html);'
assert t.count(anchor)==1
t="import {normalizeBaomoiMedia} from './baomoiMediaNews.mjs';\n"+t
t=t.replace(anchor," const baomoiMedia=normalizeBaomoiMedia(html,url);if(baomoiMedia?.error)return {error:baomoiMedia.error};if(baomoiMedia)html=baomoiMedia.html;\n const dom=native?.html||restoredClock||baomoiMedia?cheerio.load(html):options.dom||cheerio.load(html);")
p.write_text(t)
print('PATCHED_ONLY_BAOMOI_MEDIA_PARSER_HOOK')
PY
cd "$release"
/opt/news-flow/node/bin/node --test test/news-baomoi-media.test.mjs test/news-media-metadata.test.mjs test/news-strict-publication.test.mjs test/news-field-verification.test.mjs test/news-media-byline-body.test.mjs test/news-sggp-video-caption.test.mjs > /var/lib/news-flow/baomoi-repair-20261119/server-tests.tap 2>&1 || { tail -n 60 /var/lib/news-flow/baomoi-repair-20261119/server-tests.tap; exit 1; }
tail -n 9 /var/lib/news-flow/baomoi-repair-20261119/server-tests.tap
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/verify_baomoi_media_20261119.mjs
echo BAOMOI_CANDIDATE_VERIFIED_NOT_ACTIVATED
