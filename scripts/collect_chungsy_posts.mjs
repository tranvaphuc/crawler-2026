import fs from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';

const output=path.resolve(process.argv[2]||'outputs/chungsy-posts-20261117');
const limit=100,maxPages=500;
const endpoint='https://api.chungsy.vn/news-feed/latest';
const posts=new Map(),seenCursors=new Set();
let cursor=null,pages=0,stopReason='page_limit',error=null;
await fs.mkdir(output,{recursive:true});
try{
 for(;pages<maxPages;){
  const response=await axios.get(endpoint,{params:{Limit:limit,...(cursor?{Cursor:cursor}:{})},timeout:30000});
  if(!Array.isArray(response.data))throw Object.assign(new Error('FEED_NOT_ARRAY'),{code:'FEED_NOT_ARRAY'});
  const batch=response.data;pages++;
  if(!batch.length){stopReason='empty_page';break;}
  let added=0;
  for(const post of batch){
   if(post.parentPostId)continue;
   const id=String(post.postId||'').toLowerCase();
   if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))throw Object.assign(new Error('INVALID_POST_ID'),{code:'INVALID_POST_ID'});
   if(!posts.has(id)){posts.set(id,{postId:id,url:'https://chungsy.vn/posts/'+id,publishDate:post.publishDate});added++;}
  }
  const last=batch.at(-1);
  const next=Buffer.from(JSON.stringify({publishDate:last.publishDate,postId:last.postId})).toString('base64');
  if(seenCursors.has(next)||!added){stopReason='pagination_not_advancing';break;}
  seenCursors.add(next);cursor=next;
  if(pages%10===0)console.log(JSON.stringify({pages,posts:posts.size,oldest:last.publishDate}));
  await new Promise(resolve=>setTimeout(resolve,250));
 }
}catch(e){error={code:e.code||e.name,status:e.response?.status};stopReason='request_error';}
const rows=[...posts.values()];
await fs.writeFile(path.join(output,'post-links.txt'),rows.map(p=>p.url).join('\n')+(rows.length?'\n':''));
await fs.writeFile(path.join(output,'posts.json'),JSON.stringify(rows,null,2)+'\n');
await fs.writeFile(path.join(output,'post-links.csv'),'postId,url,publishDate\n'+rows.map(p=>[p.postId,p.url,p.publishDate].join(',')).join('\n')+'\n');
const verification=[];
for(const row of [rows[0],rows[Math.floor(rows.length/2)],rows.at(-1)].filter(Boolean)){
 try{const r=await axios.get('https://api.chungsy.vn/posts/'+row.postId,{timeout:20000});verification.push({url:row.url,status:r.status,postIdMatches:String(r.data?.postId||'').toLowerCase()===row.postId});}catch(e){verification.push({url:row.url,error:e.code,status:e.response?.status});}
}
const summary={checkedAt:new Date().toISOString(),source:'https://chungsy.vn/',endpoint,pages,uniquePosts:rows.length,stopReason,feedExhausted:stopReason==='empty_page',newest:rows[0]?.publishDate,oldest:rows.at(-1)?.publishDate,commentsRequested:0,paidAiCalls:0,verification,...(error?{error}:{})};
await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
if(error)process.exitCode=1;
