from pathlib import Path
import json,hashlib,tarfile
base=Path('outputs/baomoi-original-baseline')
files=['src/newsFlow/registry.mjs','src/newsFlow/processor.mjs','src/newsFlow/threeFlowRuntime.mjs','scripts/run_news_three_flow.mjs','src/web/newsResearchTransport.mjs']
manifest=[]
for name in files:
 old=(base/name).read_text(encoding='utf-8');new=Path(name).read_text(encoding='utf-8');pairs=[]
 def line(s,needle):
  values=[v for v in s.splitlines() if needle in v]
  assert len(values)==1,(name,needle,len(values))
  return values[0]
 if name.endswith('registry.mjs'):
  pairs.append([line(old,'return {sources,byHost,byUrl,allowedDomains};'),new[new.index(' const register=config=>'):new.rindex('\n}')]])
 elif name.endswith('processor.mjs'):
  pairs.append([line(old,' constructor('),line(new,' constructor(')])
  anchor=line(old,"let transport=this.transport(task,source),page=")
  pairs.append([anchor,anchor+'\n'+line(new,"this.onBaomoiOriginal)await")])
 elif name.endswith('threeFlowRuntime.mjs'):
  for needle in [' constructor(','if(now>=nextMaster)']:pairs.append([line(old,needle),line(new,needle)])
 elif name.endswith('newsResearchTransport.mjs'):
  anchor=line(old,"import {normalizeCamauPoliceArticle}")
  pairs.append([anchor,anchor+'\n'+line(new,'import {normalizeXahoiConglyOriginal}')])
  a="host==='congan.camau.gov.vn'?normalizeCamauPoliceArticle(page.html,url)"
  pairs.append([a,"host==='xahoi.congly.vn'?normalizeXahoiConglyOriginal(page.html,url):"+a])
 else:
  anchor=line(old,"import {loadNewsRegistry}")
  pairs.append([anchor,anchor+'\n'+line(new,'import {initializeOriginalBranch')])
  anchor=line(old,'const processor=new ThreeFlowProcessor')
  pairs.append([anchor,line(new,'initializeOriginalBranch(state.db)')+'\n'+line(new,'const processor=new ThreeFlowProcessor')])
  pairs.append([line(old,'runtime=new ThreeFlowRuntime'),line(new,'runtime=new ThreeFlowRuntime')])
 patched=old
 for a,b in pairs:
  assert patched.count(a)==1,(name,a)
  patched=patched.replace(a,b)
 manifest.append({'file':name,'sha256':hashlib.sha256((base/name).read_bytes()).hexdigest(),'replacements':pairs})
Path('outputs/baomoi-original-branch-manifest.json').write_text(json.dumps(manifest),encoding='utf-8')
added=['src/newsFlow/baomoiOriginalBranch.mjs','src/newsFlow/originalSourceQualification.mjs','src/web/xahoiConglyOriginalNews.mjs','scripts/run_baomoi_original_branch.mjs','scripts/audit_baomoi_original_branch.mjs','scripts/bootstrap_baomoi_original_branch.mjs','scripts/verify_baomoi_original_branch.mjs','test/news-baomoi-original-branch.test.mjs','test/news-xahoi-original-clock.test.mjs','deploy/news-flow-baomoi-original.service','outputs/baomoi-original-branch-manifest.json']
with tarfile.open('outputs/baomoi-original-branch-patch.tgz','w:gz') as tar:
 for name in added:tar.add(name,arcname=name)
print('PATCH_BUILT',len(manifest),len(added))
