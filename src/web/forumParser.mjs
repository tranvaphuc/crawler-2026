import * as cheerio from 'cheerio';
import {clean,legacyForumTopicId,legacyForumCommentId,weeklyIndex,parseVietnamDate} from './newsParser.mjs';
export function forumTopicUrl(rawUrl) {
  const u=new URL(rawUrl);u.hash='';u.pathname=u.pathname.replace(/\/(?:page-\d+|post-\d+|latest|unread)\/?$/,'').replace(/\/+$/,'');
  for(const name of ['page','utm_source','utm_medium','utm_campaign'])u.searchParams.delete(name);
  return u.href;
}
export function parseForumDateTitle(raw){
 let text=clean(raw).replace(/\s+lúc\s+/i,' ');
 text=text.replace(/(\d{1,2})\s+Tháng\s+(một|hai|ba|tư|bốn|năm|sáu|bảy|tám|chín|mười|mười một|mười hai|\d{1,2})\s+(\d{4})/i,(all,d,m,y)=>{const months={'một':1,'hai':2,'ba':3,'tư':4,'bốn':4,'năm':5,'sáu':6,'bảy':7,'tám':8,'chín':9,'mười':10,'mười một':11,'mười hai':12};return d+'/'+(months[m.toLowerCase()]||Number(m))+'/'+y;});
 text=text.replace(/^(\d{1,2}\/\d{1,2}\/)(\d{2})(\s)/, (all,p,y,tail)=>p+(Number(y)<70?'20':'19')+y+tail);
 try{return parseVietnamDate(text);}catch{return null;}
}
export function parseForumThread(html,rawUrl,siteName){
 const $=cheerio.load(html),url=forumTopicUrl(rawUrl),title=clean($('.p-title-value,h1').first().clone().find('.label,.labelLink').remove().end().text());
 const engine=$('.p-header,.p-nav').length?'xenforo2':$('.navTabs,.messageList').length?'xenforo1':'unknown';
 const elements=$('article.message--post,li.message[id],div.message[id]').toArray().filter(e=>!$(e).parents('article.message--post,li.message[id],div.message[id]').length);
 const parsed=[],rejected=[];
 for(const element of elements){
  const node=$(element),nativeId=(node.attr('id')||'').match(/(?:js-)?post[-_](\d+)/)?.[1];
  if(nativeId&&parsed.some(p=>p.nativePostId===nativeId))continue;
  const body=node.find('.message-body,.messageContent').first().clone();body.find('script,style,.message-lastEdit,.signature').remove();body.find('p,div,li,br').each((i,e)=>$(e).append('\n'));
  const content=body.text().split(/\r?\n/).map(clean).filter(Boolean).join('\n');
  const authorNode=node.find('.message-name a.username,.message-userDetails a.username,a.username').first().clone();authorNode.find('svg,title,.user_verified').remove();const author=clean(authorNode.text());
  const dateNode=node.find('.message-attribution-main time,.datePermalink .DateTime').first().length?node.find('.message-attribution-main time,.datePermalink .DateTime').first():node.find('time[datetime],time[data-time],.DateTime').first();
  let publishedDate=null;const datetime=dateNode.attr('datetime'),epoch=dateNode.attr('data-time');
  if(datetime&&Number.isFinite(new Date(datetime).getTime()))publishedDate=new Date(datetime).toISOString();else if(/^\d{9,13}$/.test(epoch||''))publishedDate=new Date(Number(epoch)*(epoch.length<13?1000:1)).toISOString();
  const rawLink=node.find('a[href*="/post-"],a[href*="#post"],.postNumber a[href],a.item.muted[href]').filter((i,a)=>{const h=$(a).attr('href')||'';return nativeId&&new RegExp('(?:post[-_]?|p=)'+nativeId+'(?:\\D|$)').test(h);}).first().attr('href');
  const permalink=rawLink?new URL(rawLink,rawUrl).href:(nativeId&&node.attr('id')==='post-'+nativeId?url+'/#post-'+nativeId:null);
  if(!publishedDate)publishedDate=parseForumDateTitle(dateNode.attr('title'));
  const attachments=body.find('img:not(.smilie),video,iframe').toArray().map(e=>({type:e.tagName,url:$(e).attr('src')||$(e).attr('data-src')||null})).filter(a=>a.url);
  const actualContent=content||(attachments.length?'Images/Video':'');
  const missing=[!nativeId&&'nativePostId',!author&&'author',!publishedDate&&'publishedDate',!permalink&&'permalink',!actualContent&&'content'].filter(Boolean);
  if(missing.length){rejected.push({id:node.attr('id'),missing});continue;}
  const postNumber=node.find('.message-attribution a[href],.messageMeta a[href],.postNumber').toArray().map(e=>clean($(e).text()).match(/^#(\d+)$/)?.[1]).find(Boolean);
  parsed.push({nativePostId:nativeId,author,authorId:author,publishedDate,content:actualContent,attachments,url:permalink,candidateLegacyId:legacyForumCommentId(permalink),position:node.attr('data-position')||(postNumber?String(Number(postNumber)-1):null)});
 }
 const topicId=title?legacyForumTopicId(url):null;
 for(const post of parsed){post.isFirstPost=post.position==='0';post.role=post.isFirstPost?'forumTopic':'forumComment';post.documentUrl=post.isFirstPost?url:post.url;if(post.isFirstPost)post.candidateLegacyId=topicId;}
 const first=parsed.find(p=>p.isFirstPost);for(const post of parsed)if(!post.isFirstPost){post.parentId=topicId;post.parentDate=first?.publishedDate||null;}
 const nextHref=$('.pageNav-jump--next,a[rel=next]').first().attr('href');const nextPageUrl=nextHref?new URL(nextHref,rawUrl).href:null;
 return {siteName,engine,threadUrl:url,title,topicId,nextPageUrl,parentLookupRequired:!first,candidateTopicIndex:parsed[0]?weeklyIndex(parsed[0].publishedDate):null,parsedPosts:parsed,rejectedPosts:rejected,completeRequiredFields:!!title&&parsed.length>0&&rejected.length===0,identityNote:'IDs shown hash observed URLs with latin1. Existing master IDs must be reconciled by native topic/post IDs and hostname/permalink aliases before writes; latest feed can include old topics with new replies.'};
}
