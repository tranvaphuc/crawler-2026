import * as cheerio from 'cheerio';
import {publicationPageKey} from './newsPublicationPageIdentity.mjs';
import {userConfirmedPublicationTimezone} from './newsUserConfirmedTimezone.mjs';
const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
const policy='user_confirmed_camau_original_media_without_description_v1';
const confirmation='baomoi_empty_description_media_2026-11-19';
const approvedNews=new Set(['134498','134472','134471','134470','134468','134469']),approvedVideos=new Set(['12988','12977']);
function target(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!=='baocamau.vn'||u.username||u.password||u.port||u.search||u.hash)return null;const video=u.pathname.match(/^\/video\/xem-video\/[a-z0-9-]+-(\d+)\.html$/),news=u.pathname.match(/^\/[a-z0-9-]+-a(\d+)\.html$/);return video?{kind:'video',id:video[1]}:news?{kind:'news',id:news[1]}:null;}catch{return null;}}
const approved=t=>t&&(t.kind==='news'?approvedNews:approvedVideos).has(t.id);
function safeMedia(raw,kind){try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)return false;return kind==='video'?u.hostname==='www.youtube.com'&&/^\/embed\/[a-zA-Z0-9_-]{11}$/.test(u.pathname):u.hostname==='baocamau.vn'&&/^\/image\/ckeditor\/.+\.(?:png|jpe?g|webp)$/i.test(u.pathname);}catch{return false;}}
const wallDate=raw=>{
 let m=clean(raw).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
 if(m)return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}${m[6]?':'+m[6]:''}`;
 m=clean(raw).match(/^(\d{1,2})(?:\/| tháng )(\d{1,2})(?:\/| )(\d{4}) (\d{2}):(\d{2})$/);
 return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')} ${m[4]}:${m[5]}`:null;
};
function evidence($,url){
 const t=target(url);if(!t||publicationPageKey($('meta[property="og:url"]').attr('content'),url)!==publicationPageKey(url))return null;
 const canonical=$('link[rel=canonical]');if(canonical.length>1||canonical.length&&publicationPageKey(canonical.attr('href'),url)!==publicationPageKey(url))return null;
 const heading=t.kind==='news'?$('#post-detail > h1'):$('.video-information > h1'),clock=t.kind==='news'?$('#post-detail > .post-date'):$('.video-information > p.mt-1');
 if(heading.length!==1||clock.length!==1||!clean(heading.text())||clean($('meta[property="og:title"]').attr('content'))!==clean(heading.text()))return null;
 const nativeIds=$('script:not([src])').map((i,e)=>$(e).text()).get().join('\n').matchAll(/data:\s*\{type:\s*['"](?:news|video)['"],id:\s*(\d+)\}/g);
 if(![...nativeIds].some(m=>m[1]===t.id))return null;
 const shown=wallDate(clock.text());if(!shown)return null;let date=shown;
 if(t.kind==='news'){
  const objects=[];$('script[type="application/ld+json"]').each((i,e)=>{try{const a=JSON.parse($(e).text());if(a['@type']==='NewsArticle')objects.push(a);}catch{}});
  if(objects.length!==1||clean(objects[0].headline||objects[0].name)!==clean(heading.text()))return null;
  const original=wallDate(objects[0].datePublished);if(!original||original.slice(0,16)!==shown.slice(0,16))return null;date=original;
 }
 let body,description;
 if(t.kind==='news'){body=$('#post-detail #post-content');if(body.length!==1)return null;body=body.clone();body.find('script,style,link,nav,footer,form,.related,.comments').remove();const lead=body.children('h4:has(img[src*="/images/header/logo"])').first(),related=lead.next('ul');if(related.length&&related.children('li').length>=2&&related.children('li').toArray().every(li=>{const links=$(li).children('a[href]');return links.length===1&&clean($(li).text())===clean(links.text())&&target(links.attr('href'));}))related.remove();lead.find('img[src*="/images/header/logo"]').remove();if(!clean(lead.text()))lead.remove();description=clean($('meta[name="description"]').attr('content')||$('meta[property="og:description"]').attr('content'));}
 else{const frame=$('.main-video-section > .ratio > iframe[src]'),desc=$('.video-information > .video-description');if(frame.length!==1||desc.length!==1||!safeMedia(frame.attr('src'),'video')||clean(frame.attr('title'))!==clean(heading.text()))return null;description=clean(desc.text());body=$('<div>').append(desc.clone().contents(),frame.clone());}
 const urls=body.find(t.kind==='video'?'iframe[src]':'img[src]').map((i,e)=>$(e).attr('src')).get();
 const text=clean(body.text()),noDescription=!description&&!text&&$('meta[name="description"],meta[property="og:description"]').toArray().every(e=>!clean($(e).attr('content')));
 if(!text&&(!urls.length||urls.some(u=>!safeMedia(u,t.kind))))return null;
 return {...t,title:clean(heading.text()),date,description,body:body.html(),urls:[...new Set(urls)],noDescription,text};
}
export function normalizeCamauOriginal(html,url){
 if(!target(url))return null;const $=cheerio.load(html),e=evidence($,url);if(!e)return {error:'camau_original_identity_or_clock_unconfirmed'};
 $('#crawler-camau-native').remove();const article=$('<article id="crawler-camau-native">').append($('<h1>').text(e.title),$('<div class="article-date">').text(e.date),$('<div class="article-sapo">').text(e.description),$('<div class="article-content">').html(e.body));$('body').append(article);
 return {html:$.html(),normalization:'camau_owned_original_fields',nativeId:e.id};
}
export function camauMissingDescriptionPolicy(config){return config?.siteName==='baocamau.vn'&&config.siteId==='baocamau.vn'&&config.descriptionPolicy===policy&&config.descriptionProvenance?.authority==='explicit_user_confirmation'&&config.descriptionProvenance.scope==='baocamau.vn'&&config.descriptionProvenance.confirmation===confirmation;}
export function camauMediaProofMatches(doc,proof,config){const p=doc?._source||doc,t=target(p?.url);return !!(approved(t)&&p?.siteName==='baocamau.vn'&&p.siteId==='baocamau.vn'&&p.description===''&&p.descriptionStatus==='not_published_by_source'&&p.content==='Images/Video'&&Array.isArray(p.nativeMediaUrls)&&p.nativeMediaUrls.length&&p.nativeMediaUrls.every(u=>safeMedia(u,t.kind))&&proof?.version===1&&proof.policy===policy&&proof.authority==='explicit_user_confirmation'&&proof.confirmation===confirmation&&proof.url===p.url&&proof.title===p.title&&proof.publishedDate===p.publishedDate&&JSON.stringify(proof.nativeMediaUrls)===JSON.stringify(p.nativeMediaUrls)&&userConfirmedPublicationTimezone({siteName:'baocamau.vn',timezone:'Asia/Ho_Chi_Minh',publicationTimePolicy:'user_confirmed_vietnam_article_clock',timezoneProvenance:proof.timezoneAuthority},p.url)&&(!config||camauMissingDescriptionPolicy(config)));}
export function markCamauMissingDescription($,url,config,parsed){
 if(!camauMissingDescriptionPolicy(config)||!userConfirmedPublicationTimezone(config,url)||!parsed?.extracted?.publicationProof?.ok)return;
 const e=evidence($,url),p=parsed._source,actual=[...parsed.extracted.images||[],...parsed.extracted.media||[]].map(m=>m.url);
 if(!approved(e)||!e.noDescription||p.title!==e.title||p.content!=='Images/Video'||e.urls.length!==actual.length||e.urls.some(u=>!actual.includes(u)))return;
 const expected=new Date(e.date.replace(' ','T')+(e.date.length===16?':00':'')+'+07:00').toISOString();if(p.publishedDate!==expected)return;
 p.description='';p.descriptionStatus='not_published_by_source';p.nativeMediaUrls=e.urls;parsed.extracted.descriptionOmissionProof={version:1,policy,authority:'explicit_user_confirmation',confirmation,url:p.url,title:p.title,publishedDate:p.publishedDate,nativeMediaUrls:e.urls,timezoneAuthority:config.timezoneProvenance};
}
export function verifyCamauMissingDescription($,parsed){const p=parsed?._source,e=evidence($,p?.url);return !!(e?.noDescription&&camauMediaProofMatches(parsed,parsed?.extracted?.descriptionOmissionProof)&&p.title===e.title&&JSON.stringify(p.nativeMediaUrls)===JSON.stringify(e.urls));}
export function camauOriginalConfig(timezoneProvenance){return {schemaVersion:1,siteName:'baocamau.vn',siteId:'baocamau.vn',registrableDomain:'baocamau.vn',homepage:'https://baocamau.vn/',allowedHosts:['baocamau.vn','www.baocamau.vn'],timezone:'Asia/Ho_Chi_Minh',timezoneProvenance,publicationTimePolicy:'user_confirmed_vietnam_article_clock',publicationDatePolicy:'original_only',publicationValidationPolicy:'strict_native_publication_v1',requiresTimezoneReviewBeforeWrite:true,enabled:true,identityEncoding:'latin1',nativePublicationAdapter:'camau_original_owned_article_v1',title:{strategy:'selector',selector:'#crawler-camau-native > h1'},publishedDate:{strategy:'selector',selector:'#crawler-camau-native > .article-date'},description:{strategy:'selector',selector:'#crawler-camau-native > .article-sapo'},body:{strategy:'selector',selector:'#crawler-camau-native > .article-content'},publicationArticleScope:'#crawler-camau-native',descriptionPolicy:policy,descriptionProvenance:{authority:'explicit_user_confirmation',scope:'baocamau.vn',confirmation},discovery:{homepage:'https://baocamau.vn/',categories:[]}};}
