import * as cheerio from 'cheerio';
import {clean,legacyForumTopicId,legacyForumCommentId,weeklyIndex} from './newsParser.mjs';
import {forumTopicUrl} from './forumParser.mjs';
export function parseTinhteThread(html,observedUrl){
 const $=cheerio.load(html);let data;try{data=JSON.parse($('#__NEXT_DATA__').text());}catch{return {completeRequiredFields:false,error:'missing_public_next_data',parsedPosts:[]};}
 const nativeId=new URL(observedUrl).pathname.match(/(?:\.|\/)(\d+)\/?$/)?.[1];
 const jobs=Object.values(data?.props?.pageProps?.apiData?.jobs||{});
 const job=jobs.find(j=>j?.thread&&(!nativeId||String(j.thread.thread_id)===nativeId));
 if(!job)return {completeRequiredFields:false,error:'matching_thread_not_in_public_state',parsedPosts:[]};
 const thread=job.thread,title=clean(thread.thread_title),url=forumTopicUrl(observedUrl),topicId=legacyForumTopicId(url);
 const date=n=>Number.isFinite(Number(n))&&Number(n)>0?new Date(Number(n)*1000).toISOString():null;
 const parentDate=date(thread.thread_create_date);
 const posts=new Map();for(const p of job.posts||[])if(String(p.thread_id)===String(thread.thread_id))posts.set(String(p.post_id),p);
 const nativeParents=new Map();for(const p of posts.values())for(const reply of Array.isArray(p.post_replies)?p.post_replies:[]){const id=typeof reply==='object'?reply.post_id:reply;if(id)nativeParents.set(String(id),String(p.post_id));}
 const parsedPosts=[],rejectedPosts=[];
 for(const p of posts.values()){
  if(p.post_is_deleted||p.post_is_published===false)continue;
  const body=cheerio.load(p.post_body_html||'');body('script,style').remove();body('br').replaceWith('\n');body('p,div,li').each((i,e)=>body(e).append('\n'));
  const text=(p.post_body_plain_text||body.root().text()||'').split(/\r?\n/).map(clean).filter(Boolean).join('\n');
  const author=clean(p.poster_username),publishedDate=date(p.post_create_date),id=String(p.post_id);
  const node=$('[id="post-'+id+'"]');const link=node.find('.thread-comment__date').attr('href');
  const provided=typeof p.links?.permalink==='string'?p.links.permalink:null;
  const permalink=new URL(link||provided||('/thread/'+thread.thread_id+'#post-'+id),url).href;
  const attachments=Array.isArray(p.attachments)?p.attachments.map(a=>({id:a.attachment_id||a.id||null,url:a.links?.permalink||a.url||a.attachment_url||null})):[];
  const inlineImages=body('img[src]').toArray().map(e=>({type:'image',url:body(e).attr('src')}));
  const content=text||(attachments.length||inlineImages.length?'Images/Video':'');
  const missing=[!id&&'nativePostId',!author&&'author',!publishedDate&&'publishedDate',!content&&'content'].filter(Boolean);
  if(missing.length){rejectedPosts.push({nativePostId:id,missing});continue;}
  const isFirstPost=!!p.post_is_first_post;
  parsedPosts.push({nativePostId:id,nativeParentPostId:nativeParents.get(id)||null,nativeThreadId:String(thread.thread_id),nativeAuthorId:String(p.poster_user_id),author,authorId:author,publishedDate,content,url:permalink,isFirstPost,role:isFirstPost?'forumTopic':'forumComment',candidateLegacyId:isFirstPost?topicId:legacyForumCommentId(permalink),parentId:isFirstPost?null:topicId,parentDate:isFirstPost?null:parentDate,index:weeklyIndex(publishedDate),likes:Number(p.post_like_count||0),reactions:Number(p.post_reaction_total||0),attachments:[...attachments,...inlineImages]});
 }
 for(const post of parsedPosts){const parent=parsedPosts.find(p=>p.nativePostId===post.nativeParentPostId);if(parent&&!parent.isFirstPost)post.commentParentId=parent.candidateLegacyId;}
 return {siteName:'tinhte.vn',engine:'tinhte-next-public-state',threadUrl:url,title,nativeThreadId:String(thread.thread_id),topicId,parentDate,totalPosts:Number(thread.thread_post_count||posts.size),declaredTopLevelComments:Number(job.posts_total||0),embeddedPosts:posts.size,paginationVerified:false,parsedPosts,rejectedPosts,completeRequiredFields:!!title&&!!parentDate&&parsedPosts.some(p=>p.isFirstPost)&&parsedPosts.length>0&&rejectedPosts.length===0,coverage:'Only public posts embedded in this page; totalPosts may require more pages',identityNote:'Observed/native IDs retained. Reconcile old master permalink aliases before writes. No API token or private endpoint is used.'};
}
