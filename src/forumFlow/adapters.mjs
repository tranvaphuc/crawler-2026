import * as cheerio from 'cheerio';
import {clean} from '../web/newsParser.mjs';
import {forumTopicUrl} from '../web/forumParser.mjs';
import {parseTinhteThread} from '../web/tinhteParser.mjs';
import {forumTime,ownedPostTime} from './time.mjs';
import {isExcludedSource} from '../web/sourceExclusions.mjs';
export function safeUrl(raw,base,site){try{const u=new URL(raw,base);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password&&!isExcludedSource(u.hostname)&&site.allowedHosts.includes(u.hostname)?u.href:null;}catch{return null;}}
export function topicUrl(raw,site){const u=new URL(forumTopicUrl(raw));if(site.domain==='otofun.net')u.hostname='www.otofun.net.vn';return u.href;}
export function nativeThreadId(url){return new URL(url).pathname.match(/(?:\.|-[ap]?|\/)(\d+)\/?(?:\.html)?$/)?.[1]||null;}
function textBody(n,$){const body=n.clone();body.find('script,style,noscript,.signature,.message-lastEdit,.messageLastEdit,.bpmb-reading-time-info,.bpmb-word-count-info').remove();body.find('img.smilie[alt]').each((i,e)=>$(e).replaceWith($('<span>').text($(e).attr('alt'))));body.find('br').replaceWith('\n');body.find('p,div,li').each((i,e)=>$(e).append('\n'));return body.text().split(/\r?\n/).map(clean).filter(Boolean).join('\n');}
function media(n,$,url){
 const result=[];
 const add=(type,raw)=>{if(!raw)return;try{const u=new URL(raw,url);if(/^https?:$/.test(u.protocol)&&!u.username&&!u.password)result.push({type,url:u.href});}catch{}};
 n.find('img:not(.smilie),video,iframe').each((i,e)=>add(e.tagName,$(e).attr('data-src')||$(e).attr('src')));
 // XenForo s9e stores lazy iframe attributes as JSON, without an actual iframe.
 // Read only the src attribute; never execute the embed payload.
 n.find('[data-s9e-mediaembed-iframe]').each((i,e)=>{try{const attrs=JSON.parse($(e).attr('data-s9e-mediaembed-iframe'));if(!Array.isArray(attrs)||attrs.length%2)return;for(let j=0;j<attrs.length;j+=2)if(attrs[j]==='src'&&typeof attrs[j+1]==='string')add('iframe',attrs[j+1]);}catch{}});
 return result.filter((x,i)=>result.findIndex(y=>y.type===x.type&&y.url===x.url)===i);
}
function nextState($){try{return JSON.parse($('#__NEXT_DATA__').text());}catch{return null;}}
function dffMetadataTitle($,url,site,time){
 const openGraphUrl=safeUrl($('meta[property="og:url"]').attr('content'),url,site);
 const openGraphTitle=clean($('meta[property="og:title"]').attr('content'));
 if(!openGraphUrl||topicUrl(openGraphUrl,site)!==url||!openGraphTitle)return '';
 const headlines=new Set();
 for(const element of $('script[type="application/ld+json"]').toArray()){
  try{
   const schema=JSON.parse($(element).text());
   for(const entry of schema['@graph']||[schema]){
    if(entry['@type']!=='NewsArticle')continue;
    const owned=safeUrl(entry.url||entry.mainEntityOfPage?.['@id'],url,site);
    if(!owned||topicUrl(owned,site)!==url)continue;
    const published=forumTime(entry.datePublished,{kind:'iso'}).publishedDate;
    if(published!==time.publishedDate)return '';
    headlines.add(clean(entry.headline));
   }
  }catch{}
 }
 return headlines.size===1&&headlines.has(openGraphTitle)?openGraphTitle:'';
}
function absolute(raw,source,now,kind='local'){return forumTime(raw,{kind,source,now});}
function requireTopic(p){if(!p.nativePostId||!p.author||!p.content||!p.publishedDate)throw Error('topic_required_fields_missing');return p;}
export function discover(html,url,site){
 const $=cheerio.load(html),urls=new Set();
 const pattern=site.threadPattern?new RegExp(site.threadPattern,'i'):null;
 const nodes=site.adapter==='wordpress'?$('.anwp-pg-post-teaser__title a,a.anwp-pg-post-teaser__title,.entry-title a'): $('a[href]');
 nodes.each((i,e)=>{const u=safeUrl($(e).attr('href'),url,site);if(u&&(!pattern||pattern.test(new URL(topicUrl(u,site)).pathname)))urls.add(topicUrl(u,site));});
 const next=[];$('.pageNav-jump--next,.PageNav a[rel=next],a[rel=next],a.next.page-numbers').each((i,e)=>{const u=safeUrl($(e).attr('href'),url,site);if(u&&u!==url)next.push(u);});
 if(!next.length&&site.adapter==='xenforo'){const current=Number(new URL(url).pathname.match(/\/page-(\d+)\/?$/)?.[1]||new URL(url).searchParams.get('page')||1);const candidates=$('.PageNav nav a,.pageNav-main a').map((i,e)=>{const u=safeUrl($(e).attr('href'),url,site);if(!u||pattern?.test(new URL(topicUrl(u,site)).pathname))return null;const num=Number(new URL(u).pathname.match(/\/page-(\d+)\/?$/)?.[1]||new URL(u).searchParams.get('page')||0);return num>current?{url:u,num}:null;}).get().sort((a,b)=>a.num-b.num);if(candidates[0])next.push(candidates[0].url);}
 return {urls:[...urls],next:[...new Set(next)]};
}
export function parseXenforo(html,rawUrl,site,now=Date.now()){
 const $=cheerio.load(html),url=topicUrl(rawUrl,site),title=clean($('h1.p-title-value,.titleBar h1,h1').first().clone().find('.label,.labelLink').remove().end().text());
 const legacy=site.legacy,selector=legacy?.postProcessor?.comments;
 let elements=$('article.message--post,li.message[id],div.message[id]');if(!elements.length&&selector)elements=$(selector);
 const posts=[],rejected=[];const seen=new Set();
 for(const element of elements.toArray()){
  const n=$(element);if(n.parents('article.message--post,li.message[id],div.message[id]').length)continue;
  const id=(n.attr('id')||'').match(/(?:js-)?post[-_](\d+)/)?.[1]||n.attr('data-content')?.match(/^post-(\d+)$/)?.[1];if(seen.has(id))continue;seen.add(id);
  try{
   if(!id)throw Error('native_post_id_missing');
   const body=n.find('.message-body,.messageContent').first();const attachments=media(body,$,rawUrl),content=textBody(body,$)||(attachments.length?'Images/Video':'');
   const authorNode=n.find('.message-name a.username,.message-userDetails a.username,a.username').first().clone();authorNode.find('svg,.user_verified').remove();const author=clean(authorNode.text());
   const time=ownedPostTime(n,{now,offsetMinutes:site.offsetMinutes});
   const link=n.find('a[href]').toArray().find(e=>new RegExp('(?:post[-_]|#post-|p=)'+id+'(?:\\D|$)').test($(e).attr('href')||''));
   const permalink=link?safeUrl($(link).attr('href'),rawUrl,site):n.attr('id')==='post-'+id?url+'/#post-'+id:null;
   if(!permalink)throw Error('post_permalink_missing');
   const num=n.find('.message-attribution-opposite a,.messageMeta .postNumber,.postNumber').toArray().map(e=>clean($(e).text()).match(/^#([\d,.]+)$/)?.[1]?.replace(/[,.]/g,'')).find(Boolean);
   const position=n.attr('data-position')??(num?String(Number(num)-1):null);
   if(position===null)throw Error('post_position_missing');
   posts.push(requireTopic({nativePostId:id,nativeThreadId:nativeThreadId(url),role:position==='0'?'forumTopic':'forumComment',url:permalink,author,authorId:author,content,attachments,publishedDate:time.publishedDate,timeEvidence:time,position:Number(position)}));
  }catch(e){rejected.push({nativePostId:id,reason:e.message});}
 }
 const pageLinks=[];$('.pageNav-main a,.PageNav nav a,.PageNav a,a[rel=next],a[rel=prev],.pageNav-jump--next,.pageNav-jump--prev').each((i,e)=>{const u=safeUrl($(e).attr('href'),rawUrl,site);if(u&&topicUrl(u,site)===url){const number=Number(new URL(u).pathname.match(/\/page-(\d+)\/?$/)?.[1]||new URL(u).searchParams.get('page')||1);pageLinks.push({url:u,number});}});
 const currentPage=Number(new URL(rawUrl).pathname.match(/\/page-(\d+)\/?$/)?.[1]||new URL(rawUrl).searchParams.get('page')||1);
 const last=pageLinks.sort((a,b)=>b.number-a.number)[0];
 const prev=pageLinks.filter(p=>p.number<currentPage).sort((a,b)=>b.number-a.number)[0];
 const next=pageLinks.filter(p=>p.number>currentPage).sort((a,b)=>a.number-b.number)[0];
 return {threadUrl:url,nativeThreadId:nativeThreadId(url),title,posts,rejected,currentPage,lastPage:last?.number||currentPage,lastPageUrl:last?.url||rawUrl,prevPageUrl:prev?.url||null,nextPageUrl:next?.url||null,coverage:rejected.length?'rejected_posts':'page_verified',complete:!!title&&posts.length>0&&!rejected.length};
}
export function parsePage(html,url,site,now=Date.now()){
 if(site.adapter==='xenforo')return parseXenforo(html,url,site,now);
 if(site.adapter==='tinhte'){
  const parsed=parseTinhteThread(html,url);const $=cheerio.load(html);const jobs=Object.values(nextState($)?.props?.pageProps?.apiData?.jobs||{});const job=jobs.find(j=>String(j?.thread?.thread_id)===parsed.nativeThreadId);
  const native=new Map((job?.posts||[]).map(p=>[String(p.post_id),p]));const posts=(parsed.parsedPosts||[]).map(p=>{const time=absolute(native.get(p.nativePostId)?.post_create_date,'matching Tinhte job.posts[].post_create_date',now,'seconds');return {...p,timeEvidence:time,publishedDate:time.publishedDate};});
  const pages=$('.pagination--pages a,.pagination a,a[rel=next]').map((i,e)=>safeUrl($(e).attr('href'),url,site)).get().filter(Boolean);
  const current=Number(new URL(url).searchParams.get('page')||new URL(url).pathname.match(/\/page-(\d+)\/?$/)?.[1]||1);
  const next=pages.filter(u=>topicUrl(u,site)===topicUrl(url,site)).map(u=>({url:u,page:Number(new URL(u).searchParams.get('page')||new URL(u).pathname.match(/\/page-(\d+)\/?$/)?.[1]||1)})).filter(x=>x.page>current).sort((a,b)=>a.page-b.page)[0];
  const completeCount=Number.isSafeInteger(parsed.totalPosts)&&parsed.totalPosts===posts.length&&!(job?.posts||[]).some(p=>Array.isArray(p.post_replies)&&p.post_replies.some(r=>!native.has(String(typeof r==='object'?r.post_id:r))));
  return {threadUrl:topicUrl(url,site),nativeThreadId:parsed.nativeThreadId,title:parsed.title,posts,rejected:parsed.rejectedPosts||[],nextPageUrl:next?.url||null,complete:!!parsed.title&&!!parsed.parentDate&&posts.length>0&&!parsed.rejectedPosts?.length,coverage:completeCount?'embedded_all_posts_verified':'embedded_only',declaredTotal:parsed.totalPosts};
 }
 const $=cheerio.load(html),threadUrl=topicUrl(url,site);let post,declaredComments=null,commentsEndpoint=null,commentNodes=null,nextPageUrl=null;
 const metaTimes=()=>{const times=$('meta[property="article:published_time"]').map((i,e)=>$(e).attr('content')).get().filter(Boolean).map(t=>absolute(t,'article:published_time',now,'iso'));if(!times.length)throw Error('original_publication_missing');if(times.some(t=>t.publishedDate!==times[0].publishedDate))throw Error('publication_meta_disagree');return times[0];};
 if(site.adapter==='bovagau'){
  const data=nextState($)?.props?.pageProps?.post;if(!data||String(data.id)!==nativeThreadId(url))throw Error('bovagau_matching_post_missing');
  const time=absolute(data.publishedAt,'post.publishedAt',now,'seconds');const meta=metaTimes();if(meta.publishedDate!==time.publishedDate)throw Error('publication_meta_disagree');
  post={nativePostId:String(data.id),author:clean(data.author?.name),authorId:String(data.author?.id),title:clean(data.title),content:clean(data.content),attachments:data.featureImage?[{type:'image',url:data.featureImage}]:[],publishedDate:time.publishedDate,timeEvidence:{...time,crossChecks:[meta]}};declaredComments=data.totalComments;
 }else if(site.adapter==='pantip'){
  const main=$('.display-post-story').first(),id=new URL(url).pathname.match(/\/topic\/(\d+)/)?.[1];
  const date=$('.display-post-timestamp').filter((i,e)=>!$(e).closest('.edit-history').length&&!($(e).attr('data-utime')||'').includes('{{')).filter((i,e)=>!!($(e).attr('title')||$(e).find('[title]').attr('title'))).first();
  const time=absolute(date.attr('title')||date.find('[title]').attr('title'),'original topic timestamp Thai title; edits excluded',now,'thai');
  post={nativePostId:id,author:clean($('.display-post-name').first().text()),title:clean($('.display-post-title').first().text()),content:textBody(main,$),attachments:media(main,$,url),publishedDate:time.publishedDate,timeEvidence:time};
  declaredComments=null;
 }else{
  const wn=site.adapter==='wn',wp=site.adapter==='wordpress',dff=site.adapter==='dff';
  const body=$(wn?'.detail-content,.article-content,.post-content':wp?'article .entry-content':dff?'.dcontent':'.lv-post-detail-001 .lv-content,.ofd-body .lv-content').first();
  let time;
  if(site.adapter==='offb')time=absolute($('meta[itemprop="datePublished"]').attr('content'),'article datePublished wall clock',now);
  else time=metaTimes();
  const author=clean($(wn?'.detail-author a,.author-name,.user-name':wp?'.entry-meta a[href*="/members/"],.entry-meta__content a[href*="/members/"],.author.vcard a':dff?'.author-name,.box-member .name,.name-user':'.lv-post-detail-001 a.lv-alias').first().text()||(wp||dff?$('meta[property="article:author"],meta[name="author"]').first().attr('content'):'')).replace(/✓$/,'');
  const title=clean($('h1').first().text())||(dff?dffMetadataTitle($,threadUrl,site,time):'');
  const id=wp?$('article[id^="post-"]').first().attr('id')?.replace('post-',''):nativeThreadId(url);
  post={nativePostId:id,author,title,content:textBody(body,$),attachments:media(body,$,url),publishedDate:time.publishedDate,timeEvidence:time};
  if(wn){const n=$('comment[blog-id]').first();if(n.length){if(n.attr('blog-id')!==id)throw Error('comment_article_id_mismatch');commentsEndpoint=safeUrl(n.attr('url'),url,site);}else{if($('#news__comment input[name="article_id"]').attr('value')!==id)throw Error('comment_article_id_mismatch');declaredComments=$('#news__comment .comment-item,.block_comment_list .item').length?null:0;}}
  if(wp){commentNodes=$('.comment-list .comment-body');const schemas=$('script[type="application/ld+json"]').map((i,e)=>{try{return JSON.parse($(e).text());}catch{return null;}}).get().flatMap(s=>s?.['@graph']||[s]);const owned=schemas.find(s=>s?.mainEntityOfPage?.['@id']&&new URL(s.mainEntityOfPage['@id']).pathname.replace(/\/$/,'')===new URL(url).pathname.replace(/\/$/,''));declaredComments=Number.isSafeInteger(owned?.commentCount)?owned.commentCount:null;nextPageUrl=safeUrl($('.nav-previous a,.next.page-numbers').first().attr('href'),url,site);}
  // DFF's initial HTML counter is a placeholder. Read LoadView t=9 instead.
  if(dff)declaredComments=null;
  if(site.adapter==='offb'){declaredComments=Number($('.lv-post-detail-001 .offb-rx-cmt,.lv-post-detail-001 .lv-total-comment').first().text().match(/\d+/)?.[0]||0);}
 }
 post={...post,role:'forumTopic',url:threadUrl,authorId:post.authorId||post.author,nativeThreadId:post.nativePostId};requireTopic(post);
 const posts=[post],rejected=[];
 if(commentNodes?.length)for(const el of commentNodes.toArray()){try{const n=$(el),id=n.attr('id')?.replace('div-comment-',''),time=absolute(n.find('time[datetime]').first().attr('datetime'),'WordPress comment time',now,'iso');posts.push(requireTopic({nativePostId:id,nativeThreadId:post.nativePostId,role:'forumComment',author:clean(n.find('.fn,.comment-author').first().text()),content:textBody(n.find('.comment-content'),$),url:threadUrl+'#comment-'+id,publishedDate:time.publishedDate,timeEvidence:time}));}catch(e){rejected.push({reason:e.message});}}
 let topicType=null;if(site.adapter==='pantip'){try{topicType=JSON.parse($('#ptConfig').text()).topic_type;}catch{}}
 return {threadUrl,nativeThreadId:post.nativePostId,title:post.title,posts,rejected,declaredComments,commentsEndpoint,topicType,nextPageUrl,complete:!rejected.length,coverage:declaredComments===0?'zero_comments_declared':'comments_unverified'};
}
