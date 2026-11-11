import json,re
from pathlib import Path
from urllib.parse import urlparse
r=Path('outputs/project-refresh-2026-11-10');d=r/'completion'
checks=json.loads((d/'source-checks.json').read_text(encoding='utf8'))
verified=[];unconfirmed=[]
for c in checks:
 if c['platform']!='tiktok' or c['decision']!='IDENTITY_CONFIRMED':continue
 expected=urlparse(c['inputUrl']).path.strip('/').split('/')[0].lstrip('@').lower()
 text=Path(c['responseFile']).read_text(encoding='utf8')
 m=re.search(r'<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>',text,re.S)
 try:root=json.loads(m[1]) if m else {};user=root.get('__DEFAULT_SCOPE__',{}).get('webapp.user-detail',{}).get('userInfo',{}).get('user',{})
 except (ValueError,TypeError):user={}
 if user.get('uniqueId','').lower()==expected and str(user.get('id','')).isdigit():verified.append({'_id':c['_id'],'platform':'tiktok','nativeId':str(user['id']),'type':'profile','name':user.get('nickname') or expected,'url':'https://www.tiktok.com/@'+user['uniqueId'],'decision':'IDENTITY_CONFIRMED','evidence':'Public profile userInfo.user.id + uniqueId exactly matches requested handle','checkedAt':c['checkedAt']})
 else:unconfirmed.append({'_id':c['_id'],'expectedHandle':expected,'returnedHandle':user.get('uniqueId'),'reason':'Metadata ID not tied to exact requested profile handle'})
(d/'tiktok-owner-verified.json').write_text(json.dumps(verified,ensure_ascii=False,indent=2),encoding='utf8')
(d/'tiktok-owner-unconfirmed.json').write_text(json.dumps(unconfirmed,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'verified':len(verified),'unconfirmed':len(unconfirmed)}))
