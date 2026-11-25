"""Mirror only this QC's deployed keys; preserve unrelated local configuration."""
import json
from pathlib import Path
root=Path('outputs/news-remaining36-2026-11-22')
for domain in ['kinhte24h.net.vn','autovina.com','thuonghieudoanhnhan.net.vn']:
    path=Path('config/web-sources/news')/(domain+'.json')
    current=json.loads(path.read_text(encoding='utf-8'))
    deployed=json.loads((root/('deployed-'+domain+'.json')).read_text(encoding='utf-8'))
    if domain=='kinhte24h.net.vn': current['publishedDate']=deployed['publishedDate']
    if domain=='autovina.com': current['enabled']=deployed['enabled']
    current['http']={**current.get('http',{}),'maxConcurrentArticles':deployed['http']['maxConcurrentArticles']}
    current.setdefault('validation',{})['remaining36Qc']=deployed['validation']['remaining36Qc']
    path.write_text(json.dumps(current,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(domain+': mirrored verified keys')
