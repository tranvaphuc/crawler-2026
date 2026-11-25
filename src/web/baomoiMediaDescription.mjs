import {isExcludedSource} from './sourceExclusions.mjs';
const policy='user_confirmed_baomoi_media_without_description_v1',confirmation='baomoi_empty_description_media_2026-11-19';
const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ownUrl=url=>{try{const u=new URL(url);return u.protocol==='https:'&&u.hostname.replace(/^www\./,'')==='baomoi.com'&&!u.username&&!u.password&&u.pathname.match(/-c(\d+)\.epi$/)?.[1];}catch{return null;}};
function safeUrl(raw){try{const u=new URL(raw);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password&&!u.port&&u.hostname.includes('.')&&!u.hostname.endsWith('.local')&&!isExcludedSource(u.href)&&!/^(?:\d+\.){3}\d+$/.test(u.hostname);}catch{return false;}}
export function baomoiEmptyDescriptionPolicy(config){return config?.siteName==='baomoi.com'&&config.siteId==='baomoi.com'&&config.descriptionPolicy===policy&&config.descriptionProvenance?.authority==='explicit_user_confirmation'&&config.descriptionProvenance.scope==='baomoi.com'&&config.descriptionProvenance.confirmation===confirmation;}
function mediaEvidence($,url){
 const id=ownUrl(url);if(!id)return null;let d;try{d=JSON.parse($('#__NEXT_DATA__').text()).props.pageProps.resp.data;}catch{return null;}const c=d?.content;
 if(String(c?.contentId)!==id||String(c?.id)!==id||clean(d.head?.meta?.description)||clean(c.description))return null;
 let urls,renderedUrls;if(d.page==='contentdetail'&&c.status===1){const media=(c.bodys||[]).filter(b=>['image','video','audio'].includes(b.type));if(media.some(b=>String(b.contentId)!==id||!safeUrl(b.content)))return null;urls=media.map(b=>safeUrl(b.originUrl)?b.originUrl:b.content);renderedUrls=media.map(b=>b.content);}
 else if(d.page==='contentdetailredirect'){let proof;try{proof=JSON.parse($('meta[name="crawler:original-media"]').attr('content'));}catch{return null;}if(proof.originalUrl!==c.originalUrl||!Array.isArray(proof.urls)||proof.urls.some(u=>!safeUrl(u)))return null;urls=proof.urls;}
 if(!urls?.length)return null;return {urls:[...new Set(urls)],renderedUrls:renderedUrls||urls,title:c.title,publishedDate:new Date((c.publishedDate||c.date)*1000).toISOString()};
}
export function baomoiMediaDescriptionProofMatches(doc,proof,config){const p=doc?._source||doc;return !!(p&&ownUrl(p.url)&&p.siteName==='baomoi.com'&&p.siteId==='baomoi.com'&&p.description===''&&p.descriptionStatus==='not_published_by_source'&&Array.isArray(p.nativeMediaUrls)&&p.nativeMediaUrls.length&&p.nativeMediaUrls.every(safeUrl)&&proof?.version===1&&proof.policy===policy&&proof.confirmation===confirmation&&proof.authority==='explicit_user_confirmation'&&proof.url===p.url&&proof.title===p.title&&proof.publishedDate===p.publishedDate&&same(proof.nativeMediaUrls,p.nativeMediaUrls)&&(!config||baomoiEmptyDescriptionPolicy(config)));}
export function markBaomoiMissingDescription($,url,config,parsed){
 if(!baomoiEmptyDescriptionPolicy(config)||!parsed?.extracted?.publicationProof?.ok||!$('meta[name="crawler:baomoi-empty-description"]').length)return;
 const evidence=mediaEvidence($,url),p=parsed._source,e=parsed.extracted;if(!evidence||clean(p.title)!==clean(evidence.title)||p.publishedDate!==evidence.publishedDate)return;
 const actual=[...(e.images||[]),...(e.media||[])].map(m=>m.url);if(evidence.renderedUrls.some(u=>!actual.includes(u)))return;
 p.description='';p.descriptionStatus='not_published_by_source';p.nativeMediaUrls=evidence.urls;
 e.descriptionOmissionProof={version:1,policy,confirmation,authority:'explicit_user_confirmation',url:p.url,title:p.title,publishedDate:p.publishedDate,nativeMediaUrls:p.nativeMediaUrls};
}
export function verifyBaomoiMissingDescription($,parsed){const evidence=mediaEvidence($,parsed?._source?.url);return !!(evidence&&baomoiMediaDescriptionProofMatches(parsed,parsed?.extracted?.descriptionOmissionProof)&&clean(evidence.title)===clean(parsed._source.title)&&evidence.publishedDate===parsed._source.publishedDate&&same(evidence.urls,parsed._source.nativeMediaUrls));}
