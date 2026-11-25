"""Mirror only the two verified publishers and their HTTP profiles."""
import json
from pathlib import Path
root=Path('outputs/news-complete27-2026-11-22')
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
for site in ['molistar.com','saoexpress.vn']:
    path=Path('config/web-sources/news')/(site+'.json')
    local,live=read(path),read(root/('deployed-'+site+'.json'))
    for key in ['enabled','title','publishedDate','body','description','nativePublicationAdapter','variants']:
        if key in live:local[key]=live[key]
    local['http']={**local.get('http',{}),'maxConcurrentArticles':live['http']['maxConcurrentArticles']}
    if 'proxyIds' in live['http']:local['http']['proxyIds']=live['http']['proxyIds']
    for key in ['complete27Qc','complete27Routing']:
        if key in live['validation']:local.setdefault('validation',{})[key]=live['validation'][key]
    path.write_text(json.dumps(local,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
path=Path('config/web-sources/news-http-profiles.json')
local,live=read(path),read(root/'deployed-news-http-profiles.json')
for site in ['molistar.com','saoexpress.vn']:local[site]=live[site]
path.write_text(json.dumps(local,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Mirrored only Molistar/SaoExpress verified fields and HTTP profile entries.')
