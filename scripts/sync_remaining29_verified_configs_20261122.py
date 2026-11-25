"""Mirror only this QC's deployed source and quality keys, preserving other edits."""
import json
from pathlib import Path
root=Path('outputs/news-remaining29-2026-11-22')
read=lambda p: json.loads(p.read_text(encoding='utf-8'))
path=Path('config/web-sources/news/vntravel.org.vn.json')
local,live=read(path),read(root/'deployed-vntravel.org.vn.json')
local['http']={**local.get('http',{}),'maxConcurrentArticles':live['http']['maxConcurrentArticles']}
local['discovery']={**local.get('discovery',{}),'categories':list(dict.fromkeys([*local.get('discovery',{}).get('categories',[]),*live['discovery']['categories']]))}
for key in ['remaining29Qc','remaining29Rss']:local['discovery'][key]=live['discovery'][key]
for variant in live['variants']:
    if variant not in local.setdefault('variants',[]):local['variants'].append(variant)
path.write_text(json.dumps(local,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
path=Path('config/web-sources/news-flow-quality.json')
local,live=read(path),read(root/'deployed-news-flow-quality.json')
for key in ['sharedContentHashes','repeatedContentEvidence']:local['sites'].setdefault('nhansac.vn',{})[key]=live['sites']['nhansac.vn'][key]
path.write_text(json.dumps(local,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
path=Path('config/web-sources/news/vietnamfdi.vn.json')
local,live=read(path),read(root/'deployed-vietnamfdi.vn.json')
for key in ['title','publishedDate','body']:local[key]={**local[key],'selector':live[key]['selector']}
local.setdefault('validation',{})['remaining29ScopeQc']=live['validation']['remaining29ScopeQc']
path.write_text(json.dumps(local,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Mirrored VNTravel, Nhansac quality guard and VietnamFDI selector scope only.')
