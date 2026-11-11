import json,csv,re,unicodedata
from pathlib import Path
r=Path('outputs/project-refresh-2026-11-10');d=r/'completion'
def norm(s):return re.sub(r'[^\w]+','',unicodedata.normalize('NFKC',s).casefold())
evidence={}
for name in ['browser-accepted.tsv','browser-accepted-continuation.tsv','browser-facebook-final.tsv']:
 for x in csv.DictReader((d/name).open(encoding='utf8'),delimiter='\t'):evidence[norm(x['query'])]=x
for x in json.loads((d/'browser-other-platforms.json').read_text(encoding='utf8')):evidence[norm(x['query'])]=x
replacements={norm(x['original']):x['query'] for x in csv.DictReader((d/'keyword-replacements.tsv').open(encoding='utf8'),delimiter='\t')}
p=json.loads((r/'keywords-priority.json').read_text(encoding='utf8'))
unmatched=[x for x in p if norm(replacements.get(norm(x['query']),x['query'])) not in evidence]
print('Matched priority rows',len(p)-len(unmatched),'/',len(p))
print('\n'.join(x['query']+' => '+x['project']+' / '+x['subject'] for x in unmatched))
