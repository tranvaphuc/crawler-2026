import * as cheerio from 'cheerio';
import {createHash} from 'node:crypto';
import {isExcludedSource} from './sourceExclusions.mjs';

const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
const titleKey=s=>clean(s).toLocaleLowerCase('vi').replace(/[\p{P}\p{S}\s]+/gu,'');
const idOf=raw=>{try{const u=new URL(raw);return u.hostname.replace(/^www\./,'')==='baomoi.com'&&u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash?u.pathname.match(/(?:^\/c|-[cr])(\d+)\.epi$/)?.[1]:null;}catch{return null;}};
const urlKey=raw=>{try{const u=new URL(raw);return u.hostname.replace(/^www\./,'')+decodeURI(u.pathname).replace(/\/$/,'')+u.search;}catch{return null;}};
function publicUrl(raw,base){try{const u=new URL(raw,base);if(!/^https?:$/.test(u.protocol)||u.username||u.password||u.port||isExcludedSource(u.href)||!u.hostname.includes('.')||/^(?:\d+\.){3}\d+$/.test(u.hostname)||u.hostname.endsWith('.local')||u.hostname==='localhost')return null;return u.href;}catch{return null;}}

export function baomoiOriginalRequest(html,url,allowedHosts){
 const id=idOf(url);if(!id||!html?.includes('__NEXT_DATA__'))return null;
 const $=cheerio.load(html);let response;try{response=JSON.parse($('script#__NEXT_DATA__[type="application/json"]').text()).props.pageProps.resp;}catch{return null;}
 const d=response?.data,c=d?.content,redirect=d?.page==='contentdetailredirect';
 let contentUrl;try{contentUrl=new URL(c?.url,url).href;}catch{return null;}
 if(response?.err!==0||!c||!['contentdetail','contentdetailredirect'].includes(d.page)||String(c.id)!==id||String(c.contentId)!==id||idOf(contentUrl)!==id||idOf(d.head?.meta?.canonicalUrl)!==id||!c.title||!redirect&&c.status!==1)return null;
 const articles=(d.head?.jsonLd||[]).filter(a=>a['@type']==='NewsArticle'&&idOf(a.mainEntityOfPage?.['@id']||a.url)===id);
 if(articles.length!==1||clean(articles[0].headline)!==clean(c.title)||String(articles[0].isAccessibleForFree)==='false'||!Number.isFinite(c.publishedDate||c.date)||Date.parse(articles[0].datePublished)!==(c.publishedDate||c.date)*1000||articles[0].datePublished!==d.head.meta.articlePublishedTime)return null;
 if(!redirect&&(!Array.isArray(c.bodys)||!c.bodys.some(b=>['image','video','audio','table'].includes(b.type))||clean(c.description)))return null;
 const originalUrl=publicUrl(c.originalUrl);if(!originalUrl)return null;const host=new URL(originalUrl).hostname.replace(/^www\./,'');
 if(!allowedHosts?.map(h=>h.replace(/^www\./,'')).includes(host))return null;
 const author=publicUrl(articles[0].author?.url),publisher=publicUrl(c.publisher?.originalUrl);
 if([author,publisher].filter(Boolean).some(u=>new URL(u).hostname.replace(/^www\./,'')!==host))return null;
 return {id,url,originalUrl,title:c.title,redirect,caption:clean(d.head.meta.description),publishedDate:articles[0].datePublished,article:articles[0],content:c};
}

function originalEvidence(html,finalUrl,request){
 if(urlKey(finalUrl)!==urlKey(request.originalUrl))return {error:'baomoi_original_redirect_identity_unconfirmed'};
 const $=cheerio.load(html),headlines=[$('meta[property="og:title"]').attr('content'),...$('h1').toArray().map(e=>$(e).text())];
 if(!headlines.some(t=>titleKey(t)===titleKey(request.title)))return {error:'baomoi_original_headline_mismatch'};
 const declared=$('link[rel=canonical]').attr('href')||$('meta[property="og:url"]').attr('content');try{if(declared&&urlKey(new URL(declared,finalUrl).href)!==urlKey(finalUrl))return {error:'baomoi_original_canonical_mismatch'};}catch{return {error:'baomoi_original_canonical_mismatch'};}
 const captions=[$('meta[name=description]').attr('content'),$('meta[property="og:description"]').attr('content'),...$('.sapo,.article__sapo,.detail-sapo,.article-sapo,.cms-desc,.news-sapo').toArray().filter(e=>!$(e).parents('nav,footer,aside,.related,.sidebar').length).map(e=>$(e).text())].map(clean);
 const caption=captions.find(s=>s.length>=20&&s.length<=4000&&titleKey(s)!==titleKey(request.title))||'';
 const media=[];const excluded='nav,footer,aside,.related,.sidebar,.news-item,.item-news,.box-category-item';
 $('video[src],video source[src],audio[src],audio source[src],iframe#onecms-video,iframe[src*="youtube.com/embed/"],iframe[src*="tv.congly.vn/embed/"],[type="VideoStream"][data-vid]').each((i,e)=>{const n=$(e);if(n.parents(excluded).length)return;let raw=n.attr('src')||n.attr('data-vid');if(n.attr('data-vid')&&!/^https?:/.test(raw))raw='https://'+raw;const u=publicUrl(raw,finalUrl);if(!u)return;const type=n.is('iframe')?'iframe':n.is('audio')||n.parent().is('audio')?'audio':'video';media.push({type,url:u});});
 const textRoots=$('.cms-body,[itemprop="articleBody"],#content_detail,.afcbc-body').toArray().filter(e=>!$(e).parents(excluded).length).map(e=>{const n=$(e).clone();n.find('script,style,nav,footer,.related,.comments,.ads').remove();const text=clean(n.text()),linkChars=n.find('a').toArray().reduce((s,a)=>s+clean($(a).text()).length,0);return {text,linkRatio:linkChars/Math.max(text.length,1)};}).filter(r=>r.text.length>=200&&r.linkRatio<0.2).sort((a,b)=>b.text.length-a.text.length);
 return {caption,media:[...new Map(media.map(m=>[m.type+' '+m.url,m])).values()],text:textRoots[0]?.text||''};
}

export function normalizeBaomoiOriginal(html,url,originalHtml,originalFinalUrl,{allowedHosts,allowEmptyDescription=false}={}){
 const request=baomoiOriginalRequest(html,url,allowedHosts);if(!request)return null;
 const evidence=originalEvidence(originalHtml,originalFinalUrl,request);if(evidence.error)return evidence;
 const caption=request.caption||evidence.caption;if(!caption&&!allowEmptyDescription)return {error:'missing_description'};
 if(!request.redirect&&!caption)return null;
 const $=cheerio.load(html);let body=$('.content-body');
 if(request.redirect){
  if(evidence.media.length!==1&&!evidence.text)return {error:'baomoi_original_primary_media_unconfirmed'};
  const restored=$('<div class="content-body">');if(caption)restored.append($('<p>').text(caption));if(evidence.text)restored.append($('<p>').text(evidence.text));
  for(const media of evidence.media)restored.append($(media.type==='iframe'?'<iframe>':media.type==='audio'?'<audio controls>':'<video controls>').attr('src',media.url));
  $('body').prepend($('<h1>').text(request.title),restored);body=$('.content-body');
  if(!caption)$('head').append($('<meta>').attr({name:'crawler:baomoi-empty-description',content:'native_media_without_description'}),$('<meta>').attr({name:'crawler:original-media',content:JSON.stringify({originalUrl:request.originalUrl,urls:evidence.media.map(m=>m.url)})}));
  $('link[rel=canonical]').attr('href',request.article.mainEntityOfPage?.['@id']||request.article.url);
 }else{
  // Use the page's own media URLs; the publisher supplies only the missing caption.
  if(body.length!==1||!Array.isArray(request.content.bodys)||request.content.bodys.some(b=>!['image','video','audio','text'].includes(b.type)))return {error:'baomoi_original_body_layout_unconfirmed'};
  body.find('.body-author,.content-social').remove();body.prepend($('<p>').text(caption));
  for(const type of ['video','image']){const items=request.content.bodys.filter(b=>b.type===type),nodes=body.find(type==='video'?'.video-wrapper':'.body-image');if(nodes.length!==items.length)return {error:'baomoi_original_media_count_mismatch'};for(let i=0;i<items.length;i++){const b=items[i],src=publicUrl(b.content);if(String(b.contentId)!==request.id||!src||!new URL(src).hostname.endsWith('.bmcdn.me')&&new URL(src).hostname!=='baomoi-video.zadn.vn')return {error:'baomoi_original_media_identity_unconfirmed'};nodes.eq(i).replaceWith(type==='video'?$('<video controls>').attr('src',src):$('<img>').attr('src',src));}}
 }
 for(const selector of ['meta[name=description]','meta[property="og:description"]'])$(selector).attr('content',caption);
 if(!$('meta[name=description]').length)$('head').append($('<meta>').attr({name:'description',content:caption}));
 $('head').append($('<meta>').attr({name:'crawler:body-source',content:request.redirect?request.originalUrl+'#native-player':url+'#__NEXT_DATA__'}),$('<meta>').attr({name:'crawler:description-source',content:request.caption?url+'#native-description':request.originalUrl+'#native-description'}));
 return {html:$.html(),originalUrl:request.originalUrl,normalization:'baomoi_declared_original_media'};
}

export async function fetchBaomoiOriginal(page,url,get,{allowedHosts,allowEmptyDescription=false}={}){
 if(!page?.html||![null,undefined,'empty_page'].includes(page.error)||page.statusCode!==200)return null;
 let request=baomoiOriginalRequest(page.html,url,allowedHosts);
 if(!request&&/-c\d+\.epi$/.test(new URL(url).pathname)&&new URL(page.finalUrl||url).pathname==='/'){
  const redirectUrl=url.replace(/-c(\d+)\.epi$/,'-r$1.epi'),redirect=await get(redirectUrl,{reviewFailed:true,taskRole:'publisher_dependency'});
  if(redirect.statusCode===200&&[null,undefined,'empty_page'].includes(redirect.error)){request=baomoiOriginalRequest(redirect.html,url,allowedHosts);if(request)page={...redirect,requestedUrl:url,finalUrl:url,baomoiRedirectEvidenceUrl:redirectUrl};}
 }
 if(!request)return null;
 let original=await get(request.originalUrl,{reviewFailed:true,taskRole:'publisher_dependency'});
 if(original.error||!original.html)return !request.redirect&&allowEmptyDescription?null:{...page,error:'baomoi_original_'+(original.error||'missing_html')};
 if(request.redirect&&new URL(request.originalUrl).hostname==='baothanhhoa.vn'){
  const $=cheerio.load(original.html),nodes=$('img.dgmedia[data-encode]');
  if(nodes.length===1&&titleKey(nodes.attr('data-title'))===titleKey(request.title)){
   const encoded=nodes.attr('data-encode'),ids='vod-'+encoded,hash=createHash('md5').update('baothanhhoa.vn@'+ids).digest('hex').slice(0,25),endpoint='https://c.dhcn.vn/media/dembeds/'+hash+'/desktop?'+new URLSearchParams({dapp:'baothanhhoa.vn',ids}),response=await get(endpoint,{reviewFailed:true,taskRole:'publisher_dependency'});
   let payload;try{payload=JSON.parse(response.html);}catch{}
   const media=payload?.err===0&&payload.data?.length===1&&payload.data[0].id===createHash('md5').update(encoded).digest('hex')?payload.data[0]:null;
   if(media?.type===':youtube'){const src=publicUrl(/^https?:/.test(media.src)?media.src:'https://'+media.src);if(src&&/^(?:www\.)?youtube\.com$/.test(new URL(src).hostname)&&/^\/embed\/[\w-]{11}$/.test(new URL(src).pathname)){nodes.replaceWith($('<iframe>').attr('src',src));original={...original,html:$.html()};}}
  }
 }
 const normalized=normalizeBaomoiOriginal(page.html,url,original.html,original.finalUrl||request.originalUrl,{allowedHosts,allowEmptyDescription});
 return normalized?.error?!request.redirect&&allowEmptyDescription?null:{...page,error:normalized.error}:normalized?{...page,...normalized,error:null,prepared:undefined}:null;
}
