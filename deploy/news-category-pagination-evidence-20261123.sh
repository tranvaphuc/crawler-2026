set -euo pipefail
python3 - <<'PY'
import sqlite3,gzip,re,json
d=sqlite3.connect('file:/var/lib/news-flow/category-coverage-20261123/audit.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row
for site,pattern in [('baodautu.vn','%/p5%'),('thuonghieu.net.vn','%/bat-dong-san/1%'),('cnet.com','%/ces/%'),('oto.com.vn','%bang-gia%')]:
 r=d.execute("SELECT url,evidence,title,listing,validation_reason FROM pages WHERE site=? AND url LIKE ? AND evidence IS NOT NULL LIMIT 1",[site,pattern]).fetchone()
 if not r:continue
 o=dict(r);s=gzip.decompress(open(r['evidence'],'rb').read()).decode();o['pagination_contexts']=[s[max(0,m.start()-120):m.end()+300] for m in list(re.finditer(r'(?:class|id)=[\"\x27][^\"\x27]*(?:paging|pagination|pager)[^\"\x27]*[\"\x27]|rel=[\"\x27](?:next|prev)[\"\x27]',s,re.I))[:3]];o['schema_types']=list(set(re.findall(r'"@type"\s*:\s*"([^"]+)"',s)))[:15];print(json.dumps(o,ensure_ascii=False))
PY
