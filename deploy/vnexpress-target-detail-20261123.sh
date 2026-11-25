set -euo pipefail
python3 - <<'PY'
import gzip,re,json
from html import unescape
p='/var/lib/news-flow/vnexpress-miss-20261123/article.html.gz';s=gzip.open(p,'rt').read()
for term in ['Ngân hàng sáng tạo','ngan-hang-sang-tao','1006173','breadcrumb']:
 print(term)
 for m in list(re.finditer(re.escape(term),s,re.I))[:8]:print(s[max(0,m.start()-300):m.end()+500])
PY
