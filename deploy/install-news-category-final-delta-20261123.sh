set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
stage=/var/lib/news-flow/category-final-delta-20261123
install -d -m 0755 "$stage"
python3 - "$upload_dir/.category-final-delta.tar.gz" "$base" "$stage" <<'PY'
import json,tarfile,shutil,sys
from pathlib import Path
bundle,base,stage=map(Path,sys.argv[1:])
with tarfile.open(bundle) as t:
 delta=json.load(t.extractfile('method-delta.json'));text=(base/delta['path']).read_text()
 if text.count(delta['before'])!=1 and text.count(delta['after'])!=1:raise RuntimeError('LIVE_CATEGORY_METHOD_CHANGED')
 shutil.copytree(base/'src',stage/'src',dirs_exist_ok=True);shutil.copytree(base/'test',stage/'test',dirs_exist_ok=True)
 for name in ['node_modules','config','scripts']:
  if not (stage/name).exists():(stage/name).symlink_to(base/name,target_is_directory=True)
 shutil.copyfile(base/'package.json',stage/'package.json')
 (stage/delta['path']).write_text(text.replace(delta['before'],delta['after'],1));(stage/'test/news-category-coverage.test.mjs').write_bytes(t.extractfile('test/news-category-coverage.test.mjs').read())
PY
cd "$stage"
/opt/news-flow/node/bin/node --test test/news-category-coverage.test.mjs test/news-discovery-health.test.mjs > tests.tap 2>&1
tail -n 10 tests.tap
python3 - "$upload_dir/.category-final-delta.tar.gz" "$base" "$stage" <<'PY'
import json,tarfile,sys,shutil,sqlite3
from pathlib import Path
bundle,base,stage=map(Path,sys.argv[1:])
def replace(file,text):
 temp=file.with_name(file.name+'.category-final.tmp');temp.write_text(text);temp.chmod(0o644);temp.replace(file)
with tarfile.open(bundle) as t:
 delta=json.load(t.extractfile('method-delta.json'));file=base/delta['path'];text=file.read_text()
 if text.count(delta['before'])!=1 and text.count(delta['after'])!=1:raise RuntimeError('LIVE_CATEGORY_METHOD_CHANGED')
 if text.count(delta['before'])==1:
  if not (stage/'threeFlowState.before.mjs').exists():shutil.copy2(file,stage/'threeFlowState.before.mjs')
  replace(file,text.replace(delta['before'],delta['after'],1))
 replace(base/'test/news-category-coverage.test.mjs',t.extractfile('test/news-category-coverage.test.mjs').read().decode())
for name in ['apply_news_category_coverage.mjs','clean_news_category_false_positives.mjs']:
 file=base/'scripts'/name;text=file.read_text();brackets=('(',')') if name.startswith('clean_') else ('[',']');old=brackets[0]+"'utility_or_non_editorial_url','self_article_not_section'"+brackets[1];new=brackets[0]+"'utility_or_non_editorial_url','self_article_not_section','verified_article_not_section'"+brackets[1]
 if old in text:
  if text.count(old)!=1:raise RuntimeError('CLASSIFICATION_ANCHOR_CHANGED')
  replace(file,text.replace(old,new,1))
 elif new not in text:raise RuntimeError('CLASSIFICATION_ANCHOR_MISSING')
file=base/'config/web-sources/news/vnexpress.net.json';original=file.read_text();c=json.loads(original)
db=sqlite3.connect('/var/lib/news-flow/news-flow-runtime/write.sqlite',timeout=30)
overlay=db.execute('SELECT config FROM parser_overlays WHERE site=?',['vnexpress.net']).fetchone()
(stage/'vnexpress-traffic-before.json').write_text(json.dumps({'config':c,'overlay':json.loads(overlay[0]) if overlay else None},ensure_ascii=False))
def limited(c):
 h=c.setdefault('http',{})
 for name,n in [('maxConcurrentArticles',2),('maxConcurrentSeeds',1)]:
  current=h.get(name);h[name]=min(current,n) if isinstance(current,int) and current>0 else n
 return c
if file.read_text()!=original:raise RuntimeError('VNEXPRESS_CONFIG_CHANGED_DURING_MERGE')
replace(file,json.dumps(limited(c),ensure_ascii=False,indent=2)+'\n')
with db:
 if overlay:db.execute('UPDATE parser_overlays SET config=? WHERE site=? AND config=?',[json.dumps(limited(json.loads(overlay[0])),ensure_ascii=False),'vnexpress.net',overlay[0]])
db.close();print('CATEGORY_KNOWN_ARTICLES_FILTER_AND_VNEXPRESS_LIMITS_INSTALLED')
PY
for service in news-flow-seed news-flow-parse; do
 install -d -m 0755 "/run/systemd/system/$service.service.d"
 printf '[Service]\nTimeoutStopSec=180\n' > "/run/systemd/system/$service.service.d/category-drain-20261123.conf"
done
cleanup() {
 systemctl start news-flow-seed news-flow-parse
 for service in news-flow-seed news-flow-parse; do rm -f "/run/systemd/system/$service.service.d/category-drain-20261123.conf"; done
 systemctl daemon-reload
}
trap cleanup EXIT
systemctl daemon-reload
systemctl stop news-flow-seed news-flow-parse
systemctl start news-flow-seed news-flow-parse
systemctl is-active news-flow-seed news-flow-parse news-flow-import
