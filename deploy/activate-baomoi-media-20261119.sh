set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
previous=/opt/news-flow/releases/20261119-stability-feed-05
release=/opt/news-flow/releases/20261119-baomoi-media-06
test "$(readlink -f /opt/news-flow/current)" = "$previous"
install -m 644 "$upload_dir/.baomoi-requeue.mjs" "$release/scripts/requeue_baomoi_verified_20261119.mjs"
python3 - "$previous" "$release" <<'PY'
import pathlib,json,sys,hashlib
p,r=map(pathlib.Path,sys.argv[1:]);root=pathlib.Path('/var/lib/news-flow/baomoi-repair-20261119')
v=json.loads((root/'full/verification.json').read_text());assert sum(bool(x.get('controlUnchanged')) for x in v['rows'])==12
assert v['counts'].get('verified',0)>12
assert hashlib.sha256((p/'src/web/configurableNewsParser.mjs').read_bytes()).hexdigest()=='11a248afe8e826c58da4ea200ec26cb6188fbfd10f49f6785f614d56cc0d2778'
t=(p/'src/web/configurableNewsParser.mjs').read_text();anchor=' const dom=native?.html||restoredClock?cheerio.load(html):options.dom||cheerio.load(html);'
t="import {normalizeBaomoiMedia} from './baomoiMediaNews.mjs';\n"+t.replace(anchor," const baomoiMedia=normalizeBaomoiMedia(html,url);if(baomoiMedia?.error)return {error:baomoiMedia.error};if(baomoiMedia)html=baomoiMedia.html;\n const dom=native?.html||restoredClock||baomoiMedia?cheerio.load(html):options.dom||cheerio.load(html);")
assert (r/'src/web/configurableNewsParser.mjs').read_text()==t
assert (r/'config/web-sources/news/baomoi.com.json').read_bytes()==(p/'config/web-sources/news/baomoi.com.json').read_bytes()
print('ACTIVATION_GATES_OK',v['counts'])
PY
writer_pid=$(systemctl show news-flow-import.service -p MainPID --value)
systemctl stop news-flow-seed.service news-flow-parse.service
rollback(){ ln -sfn "$previous" /opt/news-flow/current; systemctl start news-flow-seed.service news-flow-parse.service; }
trap rollback ERR
ln -sfn "$release" /opt/news-flow/current
cd "$release"
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/requeue_baomoi_verified_20261119.mjs
systemctl start news-flow-seed.service news-flow-parse.service
systemctl is-active news-flow-seed.service news-flow-parse.service news-flow-import.service
test "$writer_pid" = "$(systemctl show news-flow-import.service -p MainPID --value)"
trap - ERR
readlink -f /opt/news-flow/current
echo BAOMOI_MEDIA_FIX_ACTIVE
