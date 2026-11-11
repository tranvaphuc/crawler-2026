import json,gzip,copy,collections,re
from pathlib import Path
r=Path('outputs/project-refresh-2026-11-10');d=r/'completion'
load=lambda n:json.loads((d/n).read_text(encoding='utf8'))
src=json.loads((r/'sources-to-add.json').read_text(encoding='utf8'))
checks={x['_id']:x for x in load('source-checks.json')}
identities={x['_id']:x for x in load('resolved-source-identities-final.json')}
identities.update({x['_id']:x for x in load('tiktok-owner-verified.json')})
maps={x['_id']:x for x in load('maps-checks.json')}
supported={'facebook','instagram','threads','youtube'}
quarantine={'youtube:channel:c8b2628fae61e63311f9645f':'URL CAEX trả về kênh Goddess worship@, không tương ứng sàn CAEX.', 'instagram:profile:e5d99d2d55c7789e85a1cc84':'URL chancekimbrows hiện hiển thị FlyBows; chưa chứng minh cùng chủ thể Chance Kim.'}
notes={'NETWORK_UNCONFIRMED':'Không lấy được phản hồi qua mạng: DNS, timeout hoặc TLS. Giữ không chạy.','ACCESS_LIMITED':'Website chặn truy cập tự động hoặc yêu cầu đăng nhập/CAPTCHA. Giữ không chạy.','HTTP_NOT_FOUND':'URL trả 404/410 khi kiểm tra công khai. Giữ không chạy, không kết luận tài khoản đã bị xoá.','EXCLUDED_NON_PUBLIC_DESTINATION':'Địa chỉ mạng không công khai. Loại khỏi thu thập.','RESPONSE_WITHOUT_VERIFIED_IDENTITY':'Có phản hồi nhưng chưa xác minh được ID/chủ sở hữu. Giữ không chạy.','UNCONFIRMED':'Chưa có đủ bằng chứng source hoạt động và đúng chủ thể. Giữ không chạy.'}
rows=[];actions=[]
for s in src:
 if s['eligible']:continue
 c=checks[s['_id']];identity=identities.get(s['_id']);decision=c['decision'];enabled=False;reason=None
 if not identity and decision=='IDENTITY_CONFIRMED' and s['platform'] in supported:
  text=Path(c['responseFile']).read_text(encoding='utf8') if c.get('responseFile') else ''
  # YouTube must expose owner metadata, never merely a recommended-video channel ID.
  verified=s['platform']!='youtube' or bool(re.search(r'channelMetadataRenderer|itemprop=["\x27]channelId',text))
  if verified:identity={'nativeId':c.get('id'),'name':c.get('name'),'type':c.get('type'),'url':c.get('url'),'evidence':c.get('identityEvidence'),'checkedAt':c.get('checkedAt')}
 if s['_id'] in maps and maps[s['_id']]['decision']=='IDENTITY_CONFIRMED':
  m=maps[s['_id']];identity={'nativeId':m['nativeId'],'name':m['name'],'type':'place','url':m['url'],'evidence':m['evidence'],'checkedAt':m['checkedAt'],'placeId':m['placeId']}
 if s['_id'] in quarantine:decision='EXCLUDED_WRONG_SUBJECT';reason=quarantine[s['_id']]
 elif identity and identity.get('nativeId'):
  decision='IDENTITY_CONFIRMED'
  if s['platform'] in supported:enabled=True
  else:reason='Đã xác minh ID; hệ thống hiện chưa có flow worker cho nền tảng '+s['platform']+'.'
 elif s['platform'] not in supported:
  reason=notes.get(decision,'Đã kiểm tra URL.')+' Hệ thống hiện chưa có flow worker cho nền tảng '+s['platform']+'.'
 else:reason=notes.get(decision,'Chưa xác minh được ID chủ sở hữu; giữ không chạy.')
 if decision=='EXCLUDED_NON_PUBLIC_DESTINATION':reason=notes[decision]
 target=copy.deepcopy(s)
 audit={'status':'live' if identity and decision=='IDENTITY_CONFIRMED' else 'checked','decision':decision,'identityEvidence':identity.get('evidence') if identity else c.get('identityEvidence'),'checkedAt':(identity or c).get('checkedAt'),'note':reason or 'Đã xác minh source và ID; nền tảng có flow worker.','httpStatus':c.get('httpStatus'),'completionBatch':'project-refresh-completion-2026-11-11'}
 canonical=s['_id']
 if identity and identity.get('nativeId') and decision=='IDENTITY_CONFIRMED':
  target.update({k:identity[k] for k in ['nativeId','name','type','url','placeId'] if identity.get(k)})
  canonical=f"{s['platform']}:{target['type']}:{target['nativeId']}"
  target['_id']=canonical
 target.update(eligible=enabled,blockedReason=None if enabled else ('SOURCE_PLATFORM_NOT_OWNED_BY_FLOW_WORKERS' if s['platform'] not in supported else decision),audit=audit)
 actions.append({'oldId':s['_id'],'canonicalId':canonical,'source':target})
 rows.append({'sourceId':s['_id'],'canonicalId':canonical,'platform':s['platform'],'originalName':s['name'],'name':target['name'],'url':s['url'],'canonicalUrl':target['url'],'projects':s['projects'],'decision':decision,'eligible':enabled,'nativeId':target.get('nativeId'),'placeId':target.get('placeId'),'note':reason or audit['note'],'evidence':audit['identityEvidence'],'checkedAt':audit['checkedAt'],'origins':s['origins']})
assert len(rows)==len(checks)==4772
assert all(not x['eligible'] or x['platform'] in supported and x['nativeId'] and x['evidence'] for x in rows)
payload={'batch':'project-refresh-completion-2026-11-11','actions':actions}
with gzip.open(d/'source-completion-payload.json.gz','wt',encoding='utf8') as f:json.dump(payload,f,ensure_ascii=False)
(d/'sources-final-audit.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
summary={'audited':len(rows),'activationCandidates':sum(x['eligible'] for x in rows),'identityVerified':sum(x['decision']=='IDENTITY_CONFIRMED' for x in rows),'decisions':dict(collections.Counter(x['decision'] for x in rows)),'byPlatform':dict(collections.Counter(x['platform'] for x in rows)),'quarantined':len(quarantine)}
(d/'source-completion-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf8');print(json.dumps(summary))
