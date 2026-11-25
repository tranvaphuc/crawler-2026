set -euo pipefail
python3 - <<'PY'
import json,sqlite3
from pathlib import Path
base=Path('/opt/news-flow/current');root=Path('/var/lib/news-flow/category-coverage-20261123');file=base/'config/web-sources/news/quasa.io.json';text=file.read_text();c=json.loads(text);d=sqlite3.connect('/var/lib/news-flow/news-flow-runtime/write.sqlite',timeout=30);overlay=d.execute('SELECT config FROM parser_overlays WHERE site=?',['quasa.io']).fetchone()
backup=root/'quasa-traffic-before.json'
if not backup.exists():backup.write_text(json.dumps({'config':c,'overlay':json.loads(overlay[0]) if overlay else None},ensure_ascii=False))
def cap(c):
 h=c.setdefault('http',{})
 for k,n in [('maxConcurrentArticles',2),('maxConcurrentSeeds',1)]:h[k]=min(h[k],n) if isinstance(h.get(k),int) and h[k]>0 else n
 return c
if file.read_text()!=text:raise RuntimeError('QUASA_CONFIG_CHANGED_DURING_MERGE')
temp=file.with_name(file.name+'.traffic.tmp');temp.write_text(json.dumps(cap(c),ensure_ascii=False,indent=2)+'\n');temp.chmod(0o644);temp.replace(file)
with d:
 if overlay:d.execute('UPDATE parser_overlays SET config=? WHERE site=? AND config=?',[json.dumps(cap(json.loads(overlay[0])),ensure_ascii=False),'quasa.io',overlay[0]])
print(json.dumps({'site':'quasa.io','maxConcurrentArticles':c['http']['maxConcurrentArticles'],'maxConcurrentSeeds':c['http']['maxConcurrentSeeds']}))
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
