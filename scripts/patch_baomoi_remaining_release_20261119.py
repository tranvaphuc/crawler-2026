import pathlib,json,hashlib,sys,shutil
r,s=map(pathlib.Path,sys.argv[1:]);manifest=json.loads((s/'manifest.json').read_text())
for name,expected in manifest['baseline'].items():
 assert hashlib.sha256((r/name).read_bytes()).hexdigest()==expected,'LIVE_BASELINE_CHANGED:'+name
for name,expected in manifest['files'].items():
 assert hashlib.sha256((s/name).read_bytes()).hexdigest()==expected,'PATCH_CHECKSUM:'+name
 target=r/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(s/name,target);target.chmod(0o644)
def patch(name,changes,prefix=''):
 p=r/name;t=p.read_text()
 for old,new in changes:
  assert t.count(old)==1,'PATCH_ANCHOR:'+name+':'+old[:80]
  t=t.replace(old,new)
 p.write_text(prefix+t)
patch('src/web/configurableNewsParser.mjs',[("normalizeBaomoiMedia(html,url);","normalizeBaomoiMedia(html,url,{allowEmptyDescription:baomoiEmptyDescriptionPolicy(config)});")],"import {baomoiEmptyDescriptionPolicy} from './baomoiMediaDescription.mjs';\n")
patch('src/web/newsNativeVideoDescription.mjs',[
 ('export function nativeVideoDescriptionProofMatches(doc,proof,config){','export function nativeVideoDescriptionProofMatches(doc,proof,config){if(baomoiMediaDescriptionProofMatches(doc,proof,config))return true;'),
 ('export function markNativeVideoMissingDescription($,url,config,parsed){','export function markNativeVideoMissingDescription($,url,config,parsed){markBaomoiMissingDescription($,url,config,parsed);'),
 ('export function verifyNativeVideoMissingDescription($,parsed){','export function verifyNativeVideoMissingDescription($,parsed){if(verifyBaomoiMissingDescription($,parsed))return true;'),
 ('p.descriptionStatus===undefined&&p.nativeVideoUrl===undefined','p.descriptionStatus===undefined&&p.nativeVideoUrl===undefined&&p.nativeMediaUrls===undefined')
],"import {baomoiMediaDescriptionProofMatches,markBaomoiMissingDescription,verifyBaomoiMissingDescription} from './baomoiMediaDescription.mjs';\n")
patch('src/newsFlow/processor.mjs',[("return createNewsResearchTransport({nativePublicationAdapter:","return createNewsResearchTransport({baomoiConfig:source.config.siteName==='baomoi.com'?source.config:null,nativePublicationAdapter:")])
transport=(r/'src/web/newsResearchTransport.mjs').read_text();head='const u=new URL(url),host=u.hostname.replace(';assert transport.count(head)==1;start=transport.index(head);anchor=transport[start:transport.index(';',start)+1]
patch('src/web/newsResearchTransport.mjs',[(anchor,anchor+"if(host==='baomoi.com'&&options.taskRole!=='seed'&&options.baomoiConfig){const recovered=await fetchBaomoiOriginal(page,url,(target,opts)=>base.get(target,dir,label+'-original',opts),{allowedHosts:options.baomoiConfig.httpDependencyHosts,allowEmptyDescription:baomoiEmptyDescriptionPolicy(options.baomoiConfig)});if(recovered)return recovered;}")],"import {fetchBaomoiOriginal} from './baomoiOriginalNews.mjs';\nimport {baomoiEmptyDescriptionPolicy} from './baomoiMediaDescription.mjs';\n")
patch('src/newsFlow/identity.mjs',[
 ('descriptionStatus:p.descriptionStatus,nativeVideoUrl:p.nativeVideoUrl',"descriptionStatus:p.descriptionStatus,...(p.nativeMediaUrls?{nativeMediaUrls:p.nativeMediaUrls}:{nativeVideoUrl:p.nativeVideoUrl})"),
 ("if(doc._source.descriptionStatus!==undefined||doc._source.nativeVideoUrl!==undefined){","if(doc._source.nativeMediaUrls!==undefined){if(doc._source.description!==''||doc._source.descriptionStatus!=='not_published_by_source'||!Array.isArray(doc._source.nativeMediaUrls)||!doc._source.nativeMediaUrls.length||doc._source.nativeMediaUrls.some(u=>typeof u!=='string'||!/^https?:\\/\\//.test(u)))throw fail('ES5_NATIVE_MEDIA_DESCRIPTION_STATUS_INVALID');expected.descriptionStatus='keyword';expected.nativeMediaUrls='keyword_array';}\n else if(doc._source.descriptionStatus!==undefined||doc._source.nativeVideoUrl!==undefined){"),
 ("(type.properties?'object':type.type)!==expected[key]","(type.properties?'object':type.type)!==(expected[key]==='keyword_array'?'keyword':expected[key])"),
 ("if(['keyword','text'].includes(type.type)&&typeof value!=='string')","if(expected[key]==='keyword_array'&&(!Array.isArray(value)||value.some(v=>typeof v!=='string')))throw fail('ES5_INVALID_NEWS_ARRAY_'+key);\n  if(expected[key]!=='keyword_array'&&['keyword','text'].includes(type.type)&&typeof value!=='string')")])
p=r/'config/web-sources/news/baomoi.com.json';c=json.loads(p.read_text());c.update(manifest['configPatch']);assert not any(x=='fireant.vn' or x.endswith('.fireant.vn') for x in c['httpDependencyHosts']);p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
print('BAOMOI_REMAINING_CANDIDATE_PATCHED')
