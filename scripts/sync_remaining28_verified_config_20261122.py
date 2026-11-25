"""Mirror only verified Tiêu Dùng Plus keys; preserve unrelated local changes."""
import json
from pathlib import Path
root = Path('outputs/news-remaining28-2026-11-22')
path = Path('config/web-sources/news/tieudungplus.vn.json')
local = json.loads(path.read_text(encoding='utf-8'))
live = json.loads((root/'deployed-tieudungplus.vn.json').read_text(encoding='utf-8'))
for key in ['enabled', 'nativePublicationAdapter', 'title', 'publishedDate', 'description']:
    local[key] = live[key]
local['body'] = {**local['body'], 'selector': live['body']['selector']}
local['http'] = {**local.get('http', {}), 'maxConcurrentArticles': 1}
local['httpDependencyHosts'] = list(dict.fromkeys([*local.get('httpDependencyHosts', []), 'm.tieudungplus.vn']))
local['discovery'] = {**local.get('discovery', {}), 'homepage': live['discovery']['homepage'], 'categories': live['discovery']['categories']}
local.setdefault('validation', {})['remaining28Qc'] = live['validation']['remaining28Qc']
path.write_text(json.dumps(local, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print('Mirrored verified Tiêu Dùng Plus route and selectors only.')
