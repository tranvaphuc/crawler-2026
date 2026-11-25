import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {isExcludedSource} from '../src/web/sourceExclusions.mjs';
const out=path.resolve('outputs/news-forum-research-2026-11-09');
const oldRoot='/Users/phuctran/Workspace/eastdata/scripts';
const master=JSON.parse(await fs.readFile(path.join(out,'master-site-inventory.json'),'utf8'));
const baseline=JSON.parse(await fs.readFile('outputs/all-live-sources-2026-11-09/all-sources.json','utf8'));
const legacy={news:new Map(),forum:new Map()},invalidConfigs=[];
function domain(value){try{const u=new URL(/^https?:\/\//.test(value)?value:'https://'+value);const h=u.hostname.toLowerCase().replace(/^www\./,'');return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(h)&&!net.isIP(h)?h:null;}catch{return null;}}
for(const channel of ['news','forum'])for(const file of await fs.readdir(path.join(oldRoot,channel,'sites'))){if(!file.endsWith('.json'))continue;try{const p=path.join(oldRoot,channel,'sites',file),config=JSON.parse(await fs.readFile(p,'utf8'));const h=domain(config.site_name||config.domain);if(h&&!isExcludedSource(h))legacy[channel].set(h,{path:p,config});}catch(e){invalidConfigs.push({channel,file,error:e.message});}}
const aliases=new Map();for(const b of baseline)for(const u of [b.url,...b.originalUrls]){const h=domain(u);if(h&&!isExcludedSource(h)&&!isExcludedSource(b.domain))aliases.set(h,b);}
const sites=new Map(),invalid=[];
function ensure(h){if(!sites.has(h))sites.set(h,{domain:h,masterSiteNames:[],masterTypes:[],masterDocumentCounts:{},masterExamples:[],baseline:null});return sites.get(h);}
for(const b of baseline.filter(b=>['News','Forum'].includes(b.category))){if([b.domain,b.url].some(isExcludedSource))continue;const s=ensure(b.domain);s.baseline={category:b.category,url:b.url,status:b.latestBrowserStatus,reason:b.latestBrowserReason,categoryReason:b.reason,evidenceFiles:b.evidenceFiles};}
for(const row of master){const nameHost=domain(row.siteName),urlHost=domain(row.example?._source?.url||'');if([nameHost,urlHost].some(isExcludedSource))continue;if(!nameHost){invalid.push({siteName:row.siteName,type:row.type,docs:row.docCount,exampleUrl:row.example?._source?.url||null,reason:'siteName không phải hostname hợp lệ; không tự suy ra nguồn từ tên tự do'});continue;}const match=aliases.get(nameHost),key=match?.domain||nameHost;const s=ensure(key);if(match&&!s.baseline)s.baseline={category:match.category,url:match.url,status:match.latestBrowserStatus,reason:match.latestBrowserReason,categoryReason:match.reason,evidenceFiles:match.evidenceFiles};
 s.masterSiteNames.push(row.siteName);s.masterTypes.push(row.type);s.masterDocumentCounts[row.type]=(s.masterDocumentCounts[row.type]||0)+row.docCount;s.masterExamples.push({type:row.type,url:row.example?._source?.url||null,siteId:row.example?._source?.siteId||null,publishedDate:row.example?._source?.publishedDate||null,siteNameHostMismatch:!!urlHost&&urlHost!==nameHost});}
const safeField=f=>typeof f==='string'?{selector:f}:f&&typeof f==='object'?{selector:f.selector||null,attribute:f.attribute||null,remove:f.remove||null,format:f.format||null,timezone:f.timezone||null,hasLegacyExpressions:(f.replaces||[]).some(r=>r.isExpression)}:null;
const rows=[];
for(const s of sites.values()){
 s.masterSiteNames=[...new Set(s.masterSiteNames)];s.masterTypes=[...new Set(s.masterTypes)];
 const forum=s.masterTypes.some(t=>/^forum/.test(t))||s.baseline?.category==='Forum';const channel=forum?'forum':'news';
 const l=legacy[channel].get(s.domain)||s.masterSiteNames.map(n=>legacy[channel].get(domain(n))).find(Boolean);const c=l?.config;
 const fields=channel==='news'?c?.article_processor:c?.comment_processor;
 const keys=channel==='news'?['title','text','created_time']:['message','author','url','created_time'];
 const legacyFields=Object.fromEntries(keys.map(k=>[k,safeField(fields?.[k])]));
 const titleField=channel==='forum'?safeField(c?.post_processor?.title):null;
 const origin=s.baseline?.url||(c?.domain&&/^https?:/.test(c.domain)?c.domain:'https://'+s.domain+'/');
 const seed=c?.seed_url||null;
 const seedUrls=(c?.seed_urls||[]).filter(u=>{try{const parsed=new URL(u);return /^https?:$/.test(parsed.protocol)&&!parsed.username&&!parsed.password&&!/token|key|secret|session|auth/i.test(parsed.search);}catch{return false;}});
 if([origin,seed,...seedUrls].some(isExcludedSource))continue;
 const currentStatus=s.baseline?.status||'chưa kiểm tra hiện tại';
 const validLegacy=!!c&&keys.every(k=>legacyFields[k]?.selector)&&(channel==='news'||!!titleField?.selector);
 const category=s.baseline?.category||(forum?'Forum':'News (ứng viên từ master)');
 const blockedByCategory=s.baseline?.category==='Khác';
 const stage=s.domain==='antt.vn'?'pilot_in_progress':blockedByCategory?'excluded_current_category_other':currentStatus==='live'?(validLegacy?'legacy_config_needs_article_retest':'live_needs_site_parser'):c?'historical_config_needs_live_check':'master_candidate_unverified';
 const row={...s,channel,category,currentLiveStatus:currentStatus,supplemental:!s.baseline,stage,enabled:false,configuration:{homepage:origin,discoveryStrategy:channel==='news'?'homepage_and_categories':'observed_find_news_or_latest_activity',categorySeeds:seedUrls,findNewsUrl:seed,legacyConfigFile:l?.path||null,legacyArticlePattern:c?.url_processor?.pattern_match||null,legacyNativeIdPattern:c?.url_processor?.pattern_id||null,legacyFields,legacyForumTitle:titleField,legacyForumPostSelector:c?.post_processor?.comments||null,paginationSelector:c?.url_processor?.selector_next_page||c?.post_processor?.nextpage||null,pollIntervalSeconds:channel==='news'?180:60,cycleDeadlineSeconds:900,identityEncoding:'latin1',indexPattern:'masterGGGGWW',mustValidate:['current_site_identity','discovery_coverage','published_date_timezone','full_body_no_sidebar','legacy_id_match','es5_field_mapping'],articleParseVerified:s.domain==='antt.vn'?false:false},parseStatus:'Chưa kiểm tra bài hiện tại; config cũ chỉ là tham khảo, không dùng chạy tự động'};
 rows.push(row);
}
rows.sort((a,b)=>(a.supplemental-b.supplemental)||Object.values(b.masterDocumentCounts).reduce((x,y)=>x+y,0)-Object.values(a.masterDocumentCounts).reduce((x,y)=>x+y,0)||a.domain.localeCompare(b.domain));
const summary={generatedAt:new Date().toISOString(),masterRawSitesByType:master.reduce((o,r)=>(o[r.type]=(o[r.type]||0)+1,o),{}),registrySites:rows.length,baselineMatched:rows.filter(r=>!r.supplemental).length,supplementalCandidates:rows.filter(r=>r.supplemental).length,forumCandidates:rows.filter(r=>r.channel==='forum').length,legacyConfigs:{news:legacy.news.size,forum:legacy.forum.size,invalid:invalidConfigs.length},invalidSiteNameBuckets:invalid.length,stages:rows.reduce((o,r)=>(o[r.stage]=(o[r.stage]||0)+1,o),{})};
await Promise.all([['site-readiness.json',rows],['supplemental-news-candidates.json',rows.filter(r=>r.supplemental&&r.channel==='news')],['supplemental-forum-candidates.json',rows.filter(r=>r.supplemental&&r.channel==='forum')],['master-invalid-site-names.json',invalid],['legacy-config-errors.json',invalidConfigs],['registry-summary.json',summary]].map(([name,data])=>fs.writeFile(path.join(out,name),JSON.stringify(data,null,2))));
const columns=['Domain','Nhóm','Trạng thái hiện tại','Trạng thái parser','Có config cũ','siteName master','Loại master','URL homepage','Find-news URL cũ','Bổ sung','Docs master'];
const tsv=[columns.join('\t'),...rows.map(r=>[r.domain,r.category,r.currentLiveStatus,r.stage,r.configuration.legacyConfigFile?'có':'không',r.masterSiteNames.join(' | '),r.masterTypes.join(' | '),r.configuration.homepage,r.configuration.findNewsUrl||'',r.supplemental?'có':'không',Object.values(r.masterDocumentCounts).reduce((a,b)=>a+b,0)].map(v=>String(v).replace(/[\t\r\n]+/g,' ')).join('\t'))].join('\n')+'\n';
await fs.writeFile(path.join(out,'site-readiness.txt'),tsv);
console.log(JSON.stringify(summary,null,2));
