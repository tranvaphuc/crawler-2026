from pathlib import Path
import hashlib,json,tarfile
base=Path('outputs/camau-code-baseline');manifest=[]
for name in ['src/web/newsNativeVideoDescription.mjs','src/web/newsResearchTransport.mjs','src/newsFlow/registry.mjs']:
 old=(base/name).read_text(encoding='utf-8');new=Path(name).read_text(encoding='utf-8');pairs=[]
 if name.endswith('newsNativeVideoDescription.mjs'):
  a="import {publicationPageKey} from './newsPublicationPageIdentity.mjs';";pairs.append([a,a+"\nimport {camauMediaProofMatches,markCamauMissingDescription,verifyCamauMissingDescription} from './camauOriginalNews.mjs';"])
  for a,b in [('if(baomoiMediaDescriptionProofMatches(doc,proof,config))return true;','if(baomoiMediaDescriptionProofMatches(doc,proof,config)||camauMediaProofMatches(doc,proof,config))return true;'),('markBaomoiMissingDescription($,url,config,parsed);','markBaomoiMissingDescription($,url,config,parsed);markCamauMissingDescription($,url,config,parsed);'),('if(verifyBaomoiMissingDescription($,parsed))return true;','if(verifyBaomoiMissingDescription($,parsed)||verifyCamauMissingDescription($,parsed))return true;')]:pairs.append([a,b])
 elif name.endswith('newsResearchTransport.mjs'):
  a="import {normalizeXahoiConglyOriginal} from './xahoiConglyOriginalNews.mjs';";pairs.append([a,a+"\nimport {normalizeCamauOriginal} from './camauOriginalNews.mjs';"])
  a="host==='xahoi.congly.vn'?normalizeXahoiConglyOriginal(page.html,url):";pairs.append([a,"host==='baocamau.vn'?normalizeCamauOriginal(page.html,url):"+a])
 else:
  a="config={...config,publicationValidationPolicy:'strict_native_publication_v1',publicationTimePolicy:'original_clock_required',publicationDatePolicy:'original_only',requiresTimezoneReviewBeforeWrite:true};"
  b="config={...config,publicationValidationPolicy:'strict_native_publication_v1',publicationTimePolicy:userConfirmedPublicationTimezone(config,'https://'+domain+'/')?config.publicationTimePolicy:'original_clock_required',publicationDatePolicy:'original_only',requiresTimezoneReviewBeforeWrite:true};";pairs.append([a,b])
 for a,b in pairs:assert old.count(a)==1 and b in new,(name,a)
 manifest.append({'file':name,'sha256':hashlib.sha256((base/name).read_bytes()).hexdigest(),'replacements':pairs})
Path('outputs/camau-patch-manifest.json').write_text(json.dumps(manifest),encoding='utf-8')
added=['src/web/camauOriginalNews.mjs','test/news-camau-original.test.mjs','scripts/verify_camau_candidate_20261120.mjs','outputs/camau-patch-manifest.json']
with tarfile.open('outputs/camau-patch-20261120.tgz','w:gz') as tar:
 for name in added:tar.add(name,arcname=name)
print('CAMAU_PATCH_READY',len(manifest),len(added))
