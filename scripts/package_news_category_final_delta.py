"""Narrow follow-up against the already installed category methods."""
import json,tarfile,io
from pathlib import Path
r=Path('outputs/news-category-coverage-20261123')
old=next(c['after'] for c in json.loads((r/'runtime-patch.json').read_text()) if c['path']=='src/newsFlow/threeFlowState.mjs')
new=Path('src/newsFlow/threeFlowState.mjs').read_text(encoding='utf-8')
def method(s):return s[s.index(' rememberCategoryHints('):s.index(' rememberFullPublicationFeed(')]
delta={'path':'src/newsFlow/threeFlowState.mjs','before':method(old),'after':method(new)}
with tarfile.open(r/'category-final-delta.tar.gz','w:gz') as t:
 data=json.dumps(delta).encode();info=tarfile.TarInfo('method-delta.json');info.size=len(data);t.addfile(info,io.BytesIO(data))
 t.add('test/news-category-coverage.test.mjs',arcname='test/news-category-coverage.test.mjs')
print('CATEGORY_METHOD_DELTA_PACKAGED')
