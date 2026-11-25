"""Merge the verified VPS section manifest into local configs, preserving parsers."""
import argparse,json,re
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit,parse_qsl,urlencode
p=argparse.ArgumentParser();p.add_argument('manifest');args=p.parse_args();manifest=Path(args.manifest)
def key(url):
 u=urlsplit(url);h=(u.hostname or '').lower().removeprefix('www.');return urlunsplit(('https',h,u.path.rstrip('/') or '/',urlencode(sorted(parse_qsl(u.query,keep_blank_values=True))),''))
result={'files':[],'dynamic_sources':[],'added_urls':0}
groups={}
for row in json.loads(manifest.read_text(encoding='utf-8')):
 site=row['site'];url=row['url'];host=(urlsplit(url).hostname or '').lower().rstrip('.')
 if not re.fullmatch(r'[a-z0-9.-]+',site) or site=='fireant.vn' or site.endswith('.fireant.vn') or host=='fireant.vn' or host.endswith('.fireant.vn'):raise RuntimeError('EXCLUDED_OR_INVALID_SOURCE')
 groups.setdefault(site,[]).append(url)
for site,urls in sorted(groups.items()):
 file=Path('config/web-sources/news')/(site+('.validated' if site=='antt.vn' else '')+'.json')
 if not file.exists():result['dynamic_sources'].append({'site':site,'urls':len(urls)});continue
 config=json.loads(file.read_text(encoding='utf-8'));before=json.loads(json.dumps(config));discovery=config.setdefault('discovery',{});categories=discovery.setdefault('categories',[]);known={key(v if isinstance(v,str) else v['url']) for v in categories}
 added=[]
 for url in urls:
  k=key(url)
  if k not in known:categories.append(url);known.add(k);added.append(url)
 if not added:continue
 stripped=json.loads(json.dumps(config));stripped['discovery']['categories']=before.get('discovery',{}).get('categories',[])
 if 'discovery' not in before:stripped.pop('discovery')
 elif 'categories' not in before['discovery']:stripped['discovery'].pop('categories')
 if stripped!=before:raise RuntimeError('UNRELATED_CONFIG_FIELDS_CHANGED:'+site)
 file.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');result['files'].append({'site':site,'added':len(added)});result['added_urls']+=len(added)
(manifest.parent/'local-config-sync.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'files':len(result['files']),'added_urls':result['added_urls'],'dynamic_sources':len(result['dynamic_sources'])}))
