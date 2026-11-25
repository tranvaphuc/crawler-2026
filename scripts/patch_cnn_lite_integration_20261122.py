"""Narrow, guarded integration; also usable against the production checkout."""
from pathlib import Path
import json,sys,hashlib
base=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
rules={
 'src/web/configurableNewsParser.mjs':[
 ("import {normalizeBaomoiMedia}","import {cnnLitePublicAccessProof} from './newsCnnLite.mjs';\nimport {normalizeBaomoiMedia}"),
 ("if(identity.canonicalIsAttribution)result.extracted.canonicalUrl=url;","if(identity.canonicalIsAttribution||identity.preserveRequestedIdentity)result.extracted.canonicalUrl=url;"),
 ("markNativeVideoMissingDescription(dom,result._source.url,effective,result);return result;};","markNativeVideoMissingDescription(dom,result._source.url,effective,result);const access=cnnLitePublicAccessProof(dom,url,effective);if(access&&result.extracted?.publisherRestricted){result.extracted.cnnLitePublicAccessProof=access;result.extracted.publisherRestricted=false;}return result;};")],
 'src/web/newsPublicationPageIdentity.mjs':[
 ("const clean = value", "import {cnnLitePublicAccessProof} from './newsCnnLite.mjs';\nconst clean = value"),
 (" const requested = new URL(url), declared = new URL(canonical, url), domain = requested.hostname.replace(/^www\\./, '');", " const access=cnnLitePublicAccessProof($,url,config);if(access)return {kind:'cnn_lite_canonical_v1',keys:[publicationPageKey(url),publicationPageKey(access.canonicalUrl)],declaredCanonical:access.canonicalUrl,canonicalIsAttribution:false,preserveRequestedIdentity:true};\n const requested = new URL(url), declared = new URL(canonical, url), domain = requested.hostname.replace(/^www\\./, '');")],
 'src/newsFlow/identity.mjs':[
 ("import {nativeVideoDescriptionProofMatches}","import {cnnLitePublicAccessProofMatches} from '../web/newsCnnLite.mjs';\nimport {nativeVideoDescriptionProofMatches}"),
 (" if(!e.dateEvidence||!e.dateTimezone||e.publisherRestricted)"," if(e.cnnLitePublicAccessProof&&!cnnLitePublicAccessProofMatches(p,e.cnnLitePublicAccessProof))throw fail('NEWS_PUBLIC_ACCESS_PROOF_INVALID');\n if(config.nativePublicationAdapter==='cnn_public_lite'&&!cnnLitePublicAccessProofMatches(p,e.cnnLitePublicAccessProof))throw fail('NEWS_PUBLIC_ACCESS_PROOF_REQUIRED');\n if(!e.dateEvidence||!e.dateTimezone||e.publisherRestricted)")],
 'src/web/newsResearchTransport.mjs':[
 ("import {fetchBaomoiOriginal}","import {fetchCnnLiteArticle,normalizeCnnLiteListing} from './newsCnnLite.mjs';\nimport {fetchBaomoiOriginal}"),
 ("get(url,dir,label,requestOptions){if(options.nativePublicationAdapter==='owned_wordpress_full_rss'", "get(url,dir,label,requestOptions){if(options.nativePublicationAdapter==='cnn_public_lite'&&options.taskRole!=='seed'&&requestOptions?.taskRole!=='publication_feed'){const lite=await fetchCnnLiteArticle(url,(target,opts)=>base.get(target,dir,label+'-publisher-lite',{...requestOptions,...opts}));if(lite)return lite;}if(options.nativePublicationAdapter==='owned_wordpress_full_rss'"),
 ("const feed=normalizePublicationFeedListing(page.html,page.finalUrl||url);", "const lite=normalizeCnnLiteListing(page.html,page.finalUrl||url);if(lite)return {...page,...lite,error:null};const feed=normalizePublicationFeedListing(page.html,page.finalUrl||url);")],
 'src/newsFlow/processor.mjs':[
 ("timezone:parsed.extracted.dateTimezone,...(doc._source", "timezone:parsed.extracted.dateTimezone,...(parsed.extracted.cnnLitePublicAccessProof?{publicAccessProof:parsed.extracted.cnnLitePublicAccessProof}:{}),...(doc._source"),
 ("publicationProof:parsed.extracted.publicationProof,...(parsed.extracted.descriptionOmissionProof", "publicationProof:parsed.extracted.publicationProof,...(parsed.extracted.cnnLitePublicAccessProof?{publicAccessProof:parsed.extracted.cnnLitePublicAccessProof}:{}),...(parsed.extracted.descriptionOmissionProof")],
}
prepared=[]
for name,changes in rules.items():
 p=base/name
 before=p.read_bytes().decode('utf-8');after=before
 for old,new in changes:
  if after.count(old)!=1:raise RuntimeError('INTEGRATION_BASELINE_MISMATCH:'+name+':'+old[:80])
  after=after.replace(old,new)
 prepared.append((p,before,after))
if len(sys.argv)>2:
 out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
 manifest=[]
 for p,before,after in prepared:
  target=out/p.name;target.write_text(after,encoding='utf-8',newline='\n')
  manifest.append({'file':str(p),'candidate':str(target),'beforeSha':hashlib.sha256(before.encode()).hexdigest(),'afterSha':hashlib.sha256(after.encode()).hexdigest()})
 (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
else:
 for p,before,after in prepared:p.write_text(after,encoding='utf-8',newline='\n')
print(json.dumps({'prepared':len(prepared)}))
