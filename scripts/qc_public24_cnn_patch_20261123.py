import hashlib,json,sys
from pathlib import Path
base=Path('/opt/news-flow/current'); root=Path('/var/lib/news-flow/qc-public24-20261123'); target=base/'src/web/newsCnnLite.mjs'
raw=target.read_bytes(); text=raw.decode('utf-8'); eol='\r\n' if b'\r\n' in raw else '\n'
replacements=[
 (",original=clean(a.articleBody);",",blocks=body.find('p.paragraph--lite,h3.subheader--lite').toArray().map(e=>clean($(e).text())).filter(Boolean),original=clean(a.articleBody);"),
 ('for(const p of paragraphs){','for(const p of blocks){'),
 (' return {article:a,'," const textBody=body.clone();textBody.find('p,div,li,figcaption,h2,h3,tr').each((i,e)=>$(e).append('\\n'));"+eol+' return {article:a,'),
 ('bodySha256:sha(body.text())','bodySha256:sha(textBody.text())'),
]
for old,new in replacements:
 if text.count(old)!=1:raise RuntimeError('CNN_PATCH_BASELINE_MISMATCH')
 text=text.replace(old,new)
candidate=text.encode('utf-8'); backup=root/'cnn-helper-before.mjs'; after=root/'cnn-helper-candidate.mjs'
backup.write_bytes(raw); after.write_bytes(candidate)
manifest={'path':str(target),'backup':str(backup),'candidate':str(after),'beforeSha':hashlib.sha256(raw).hexdigest(),'afterSha':hashlib.sha256(candidate).hexdigest()}
(root/'cnn-helper-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(manifest))
