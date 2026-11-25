import * as c from 'cheerio';import {forumTime} from './time.mjs';import {clean} from '../web/newsParser.mjs';import {publicRead} from './publicRead.mjs';
const body=html=>{const $=c.load(html||'');$('script,style').remove();$('br').replaceWith('\n');return $.root().text().trim();};
export function parsePantipComments(data,root,now=Date.now()){
 if(String(data?.paging?.topic_id)!==root.nativeThreadId||!Array.isArray(data.comments)||!Number.isInteger(data.count))throw Error('PANTIP_COMMENT_RESPONSE_MISMATCH');
 const posts=[],rejected=[];let repliesComplete=true;
 for(const item of data.comments){
  const add=(p,reply)=>{try{const time=forumTime(p.data_addrtitle,{kind:'thai',now,source:'matching comment.data_addrtitle'});if(p.created_time){const epoch=forumTime(p.created_time,{kind:'seconds',now,source:'matching comment.created_time'});if(epoch.publishedDate!==time.publishedDate)throw Error('post_time_sources_disagree');time.crossChecks=[epoch];}
   const dom=c.load(p.message||'');const attachments=dom('img[src],video[src],iframe[src]').map((i,e)=>{try{return {type:e.tagName,url:new URL(dom(e).attr('src'),root.threadUrl).href};}catch{return null;}}).get().filter(x=>x&&/^https?:/.test(x.url));
   const id=String(reply?p.reply_id:p._id),author=clean(p.user?.name),content=body(p.message)||(attachments.length?'Images/Video':''),url=root.threadUrl+'/comment'+p.comment_no+(reply?'-'+p.reply_no:'');if(!/^[0-9]+$/.test(id)||!author||!content)throw Error('comment_required_fields_missing');
   posts.push({nativePostId:(reply?'reply:':'comment:')+id,nativeThreadId:root.nativeThreadId,nativeParentPostId:reply?'comment:'+item._id:null,role:'forumComment',url,author,authorId:String(p.user?.mid||p.member_id||author),content,attachments,publishedDate:time.publishedDate,timeEvidence:time});
  }catch(e){rejected.push({reason:e.message});}};
  add(item,false);for(const reply of item.replies||[])add(reply,true);
  if(Number(item.reply_count)!==(item.replies||[]).length)repliesComplete=false;
 }
 return {posts,rejected,repliesComplete};
}
export function parseWnComments(data,root,now=Date.now()){
 if(data?.code!==0||!Array.isArray(data.data)||!Number.isInteger(data.meta?.current_page)||!Number.isInteger(data.meta?.last_page)||!Number.isInteger(data.meta?.total))throw Error('WN_COMMENT_RESPONSE_INVALID');
 const posts=[],rejected=[];let repliesComplete=true;
 for(const p of data.data){try{
  if(p.blog_id!==undefined&&String(p.blog_id)!==root.nativeThreadId)throw Error('comment_article_id_mismatch');
  const time=forumTime(p.created_at,{kind:/(Z|[+-]\d\d:?\d\d)$/.test(p.created_at||'')?'iso':'local',now,source:'matching WN comment.created_at'});
  const author=clean(p.user?.name||p.name),content=body(p.content);if(!p.id||!author||!content)throw Error('comment_required_fields_missing');
  posts.push({nativePostId:String(p.id),nativeThreadId:root.nativeThreadId,role:'forumComment',url:root.threadUrl+'#comment-'+p.id,author,authorId:String(p.user?.id||author),content,publishedDate:time.publishedDate,timeEvidence:time});
  if(p.replies?.length||Number(p.replies_count)>0)repliesComplete=false;
 }catch(e){rejected.push({reason:e.message});}}
 return {posts,rejected,repliesComplete};
}
export async function collectComments({site,root,read=publicRead,evidenceDirectory,maxPages=100,save}){
 const request=async(url,form)=>read({site,url,referer:root.threadUrl,form,evidenceDirectory});
 if(['zero_comments_declared','embedded_all_posts_verified'].includes(root.coverage))return {complete:true,coverage:root.coverage};
 if(site.adapter==='wn'&&root.commentsEndpoint){let page=1,seen=0;do{const url=new URL(root.commentsEndpoint);url.search=new URLSearchParams({blog_id:root.nativeThreadId,sort:'newest',page:String(page)}).toString();const r=await request(url.href),data=JSON.parse(r.text);const parsed=parseWnComments(data,root);if(parsed.rejected.length)throw Error('WN_COMMENTS_REJECTED');if(data.meta.current_page!==page)throw Error('WN_COMMENT_PAGE_MISMATCH');await save({...root,posts:parsed.posts,rejected:[],coverage:'comment_page_verified',complete:true},r.metadata);seen+=data.data.length;if(!parsed.repliesComplete)return {complete:false,coverage:'nested_replies_unverified'};if(page>=data.meta.last_page)return {complete:seen===data.meta.total,coverage:seen===data.meta.total?'comments_verified':'comment_count_mismatch'};page++;}while(page<=maxPages);return {complete:false,coverage:'comment_page_limit'};}
 if(site.adapter==='pantip'){
  if(!Number.isInteger(root.topicType))return {complete:false,coverage:'pantip_topic_type_missing'};let page=1,count=0,allReplies=true;
  do{const url=new URL('/forum/topic/render_comments',root.threadUrl);url.search=new URLSearchParams({tid:root.nativeThreadId,param:'page'+page,type:String(root.topicType),page:String(page)}).toString();const r=await request(url.href),data=JSON.parse(r.text);const parsed=parsePantipComments(data,root);if(parsed.rejected.length)throw Error('PANTIP_COMMENTS_REJECTED');if(data.paging.page!==page)throw Error('PANTIP_COMMENT_PAGE_MISMATCH');await save({...root,posts:parsed.posts,rejected:[],coverage:'comment_page_verified',complete:true},r.metadata);count+=data.comments.length;allReplies&&=parsed.repliesComplete;if(count>=data.count)return {complete:count===data.count&&allReplies,coverage:count===data.count&&allReplies?'comments_verified':'nested_replies_unverified'};if(!data.comments.length)throw Error('PANTIP_EMPTY_COMMENT_PAGE');page++;}while(page<=maxPages);return {complete:false,coverage:'comment_page_limit'};
 }
 if(site.adapter==='dff'){
  const u=new URL('/vendor/dffvn/news/Handler/LoadView.ashx?t=9',root.threadUrl);const r=await request(u.href,{nid:root.nativeThreadId});const stats=JSON.parse(r.text);
  if(stats?.code!==200||!Number.isSafeInteger(stats.data?.TotalComment)||stats.data.TotalComment<0)throw Error('DFF_COMMENT_STATS_INVALID');
  return {complete:stats.data.TotalComment===0,coverage:stats.data.TotalComment===0?'zero_comments_verified':'dff_comment_pagination_unverified'};
 }
 return {complete:false,coverage:root.coverage||'comments_unverified'};
}
