import {test} from 'node:test';import assert from 'node:assert/strict';
import {forumTime,ownedPostTime} from '../src/forumFlow/time.mjs';import * as c from 'cheerio';
import {parseXenforo,parsePage,discover} from '../src/forumFlow/adapters.mjs';
import {ForumState} from '../src/forumFlow/state.mjs';import {ForumRuntime} from '../src/forumFlow/runtime.mjs';
import {parsePantipComments,collectComments} from '../src/forumFlow/comments.mjs';
const now=Date.parse('2026-11-17T16:00:00Z'),site={domain:'forum.test',adapter:'xenforo',homepage:'https://forum.test/',allowedHosts:['forum.test'],threadPattern:'^/threads/[^/]+\\.\\d+/?$',seeds:['https://forum.test/'],maxSeedPages:10,maxThreadPagesPerRun:100,pollSeconds:60,offsetMinutes:420};
const post=(id,num,date='2026-11-17T10:00:00+0700',body='Nội dung')=>`<article class="message--post" id="js-post-${id}" data-position="${num-1}"><a class="username">Tác giả</a><div class="message-attribution-main"><a href="/threads/a.100/post-${id}"><time datetime="${date}" data-time="10:00" title="17/11/26 lúc 10:00"></time></a></div><div class="message-body">${body}</div><div class="message-attribution-opposite"><a href="/threads/a.100/post-${id}">#${num}</a></div></article>`;
const page=(p,nav='')=>'<h1>A</h1>'+p+nav;
test('explicit UTC, native seconds and milliseconds convert once; locale is host independent',()=>{
 for(const tz of ['UTC','America/New_York','Asia/Bangkok']){const before=process.env.TZ;process.env.TZ=tz;try{assert.equal(forumTime('17/11/2026 00:05',{now}).publishedDate,'2026-11-16T17:05:00.000Z');}finally{if(before===undefined)delete process.env.TZ;else process.env.TZ=before;}}
 const epoch=Date.parse('2026-11-17T03:00:00Z');assert.equal(forumTime(String(epoch/1000),{kind:'seconds',now}).publishedDate,forumTime(String(epoch),{kind:'milliseconds',now}).publishedDate);
 assert.equal(forumTime('2026-11-17T10:00:00+0700',{kind:'iso',now}).publishedDate,'2026-11-17T03:00:00.000Z');
});
test('absolute clock validation rejects ambiguous/missing, relative, future and rolled dates',()=>{
 for(const raw of ['Hôm nay lúc 10:00','3 giờ trước','17/11/2026','31/02/2026 10:00','17/11/2026 24:00','17/11/2026 12:60','11/17/2026 10:00'])assert.throws(()=>forumTime(raw,{now}));
 assert.throws(()=>forumTime('2026-11-17T10:00:00',{kind:'iso',now}));assert.throws(()=>forumTime('2026-02-31T10:00:00Z',{kind:'iso',now}));assert.throws(()=>forumTime('2026-12-17T10:00:00Z',{kind:'iso',now}));
 assert.equal(forumTime('17/11/2026 12:00 AM',{now}).publishedDate,'2026-11-16T17:00:00.000Z');assert.equal(forumTime('17/11/2026 12:00 PM',{now}).publishedDate,'2026-11-17T05:00:00.000Z');
});
test('Vietnamese months, short year and Thai Buddhist year are explicit',()=>{
 assert.equal(forumTime('17 Tháng mười một 2026 lúc 10:00',{now}).publishedDate,'2026-11-17T03:00:00.000Z');
 assert.equal(forumTime('17/11/26 lúc 10:00',{now}).publishedDate,'2026-11-17T03:00:00.000Z');
 assert.equal(forumTime('17 พฤศจิกายน 2569 เวลา  00:53:55 น.',{kind:'thai',now}).publishedDate,'2026-11-16T17:53:55.000Z');
});
test('XenForo data-time clock is not an epoch; conflicting owned native clocks block publication',()=>{
 const html=page(post(1,1));const parsed=parseXenforo(html,'https://forum.test/threads/a.100/',site,now);assert.equal(parsed.posts[0].publishedDate,'2026-11-17T03:00:00.000Z');
 assert.equal(parseXenforo(html.replace('data-time="10:00"','data-timestamp="1794888000"'),'https://forum.test/threads/a.100/',site,now).posts.length,0);
});
test('modified timestamps and quoted times cannot replace original post attribution',()=>{
 const html=page(post(1,1,undefined,'<blockquote><time datetime="2026-11-01T12:00:00Z"></time>Quote</blockquote>Original').replace('<div class="message-attribution-main">','<div class="message-lastEdit"><time datetime="2026-11-17T12:00:00Z"></time></div><div class="message-attribution-main">'));
 assert.equal(parseXenforo(html,'https://forum.test/threads/a.100',site,now).posts[0].publishedDate,'2026-11-17T03:00:00.000Z');
 assert.equal(parseXenforo(page(post(1,1).replace('class="message-attribution-main"','class="message-lastEdit"')),'https://forum.test/threads/a.100',site,now).posts.length,0);
});
test('later pages preserve first comment, thousands separators and parent lookup',()=>{
 const p=post(2,16086).replace(' data-position="16085"','').replace('#16086','#16,086');const r=parseXenforo(page(p),'https://forum.test/threads/a.100/page-805',site,now);assert.equal(r.posts[0].role,'forumComment');assert.equal(r.posts[0].position,16085);
});

test('Otofun video-only replies retain lazy s9e embeds and original attribution',()=>{
 const attrs=JSON.stringify(['allowfullscreen','','src','https://www.youtube.com/embed/j65hyYNb9GQ?start=64']).replaceAll('"','&quot;');
 const html=page(post(73198483,32,undefined,`<span data-s9e-mediaembed="youtube"><span data-s9e-mediaembed-iframe="${attrs}"></span></span>`));
 const r=parseXenforo(html,'https://forum.test/threads/a.100/page-2',site,now);
 assert.equal(r.complete,true);assert.equal(r.posts[0].content,'Images/Video');assert.equal(r.posts[0].role,'forumComment');
 assert.deepEqual(r.posts[0].attachments,[{type:'iframe',url:'https://www.youtube.com/embed/j65hyYNb9GQ?start=64'}]);
 assert.equal(r.posts[0].publishedDate,'2026-11-17T03:00:00.000Z');
 for(const payload of ['not json',JSON.stringify(['src','javascript:alert(1)']),JSON.stringify(['src'])]){
  const bad=html.replace(attrs,payload.replaceAll('"','&quot;'));assert.equal(parseXenforo(bad,'https://forum.test/threads/a.100/page-2',site,now).complete,false);
 }
});

test('native smiley-only posts retain their public text instead of blocking the thread',()=>{
 for(const alt of [':p','= ((',':6cool_ah:','<3']){
  const body=`<img class="smilie" src="/smilies/face.png" alt="${alt.replaceAll('<','&lt;')}">`;
  const r=parseXenforo(page(post(1,1)+post(2,2,undefined,body)),'https://forum.test/threads/a.100',site,now);
  assert.equal(r.complete,true);assert.equal(r.posts.length,2);
  assert.equal(r.posts[1].content,alt);assert.equal(r.posts[1].publishedDate,'2026-11-17T03:00:00.000Z');
 }
 const empty=page(post(1,1)+post(2,2,undefined,'<img class="smilie" src="/smilies/face.png" alt="">'));
 assert.equal(parseXenforo(empty,'https://forum.test/threads/a.100',site,now).complete,false);
});
test('discovery deduplicates topic navigation, rejects external hosts and keeps updated old topics',()=>{
 const r=discover('<a href="/threads/a.100/latest">Old topic with new reply</a><a href="/threads/a.100/page-2">X</a><a href="https://evil.test/threads/a.3">X</a>','https://forum.test/',site);assert.deepEqual(r.urls,['https://forum.test/threads/a.100']);
});
test('atomic page storage uses original parent time and own comment week, preserving insertedDate',async()=>{
 const s=await ForumState.open(':memory:');try{const r=parseXenforo(page(post(1,1)),'https://forum.test/threads/a.100',site,now);s.savePage(site,r,{finalUrl:r.threadUrl},{since:Date.parse('2026-10-01')});const p=s.parent(site.domain,'100');
 const comment={...r.posts[0],nativePostId:'2',role:'forumComment',url:r.threadUrl+'/post-2',publishedDate:'2026-11-09T01:00:00Z'};s.savePage(site,{...r,posts:[comment]},{finalUrl:r.threadUrl+'/page-2'});const docs=s.db.prepare('SELECT doc FROM forum_documents').all().map(x=>JSON.parse(x.doc));assert.equal(docs.find(d=>d._type==='forumComment')._source.parentDate,p.doc._source.publishedDate);assert.equal(docs.find(d=>d._type==='forumComment')._index,'master202646');
 assert.throws(()=>s.savePage(site,{...r,posts:[{...r.posts[0],publishedDate:'2026-11-17T04:00:00Z'}]},{finalUrl:r.threadUrl}),/ORIGINAL_TOPIC_TIME_CHANGED/);
 assert.equal(s.parent(site.domain,'100').doc._source.insertedDate,p.doc._source.insertedDate);
 }finally{s.close();}
});
test('missing parent rolls back entire comment page',async()=>{const s=await ForumState.open(':memory:');try{const r=parseXenforo(page(post(2,2)),'https://forum.test/threads/a.100/page-2',site,now);assert.throws(()=>s.savePage(site,r,{finalUrl:r.threadUrl}),/ORIGINAL_PARENT_REQUIRED/);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM forum_documents').get().n,0);}finally{s.close();}});
test('download failure never advances comment cursor or marks complete',async()=>{
 const s=await ForumState.open(':memory:');try{s.enqueue(site.domain,'https://forum.test/threads/a.100','100');const row=s.ready(site.domain,1)[0];const runtime=new ForumRuntime({state:s,sites:[site],transport:{get:async()=>({error:'access_blocked'}),close:async()=>{}}});await runtime.topic(site,row);const result=s.db.prepare('SELECT * FROM forum_urls').get();assert.equal(result.processed,0);assert.equal(result.resume_url,null);assert.match(result.reason,/DOWNLOAD/);}finally{s.close();}
});
test('native namespace prevents topic URL alias duplicates',async()=>{const s=await ForumState.open(':memory:');try{s.enqueue(site.domain,'http://forum.test/threads/old.100','100');s.enqueue(site.domain,'https://forum.test/threads/new.100','100');assert.equal(s.db.prepare('SELECT COUNT(*) n FROM forum_urls').get().n,1);}finally{s.close();}});
test('Pantip replies use original per-reply clock and incomplete nested replies stay pending',()=>{
 const data={count:1,paging:{topic_id:100},comments:[{_id:2,comment_no:1,user:{name:'A'},message:'Text',data_addrtitle:'17 พฤศจิกายน 2569 เวลา 10:00:00 น.',reply_count:2,replies:[{reply_id:3,reply_no:1,comment_no:1,user:{name:'B'},message:'Reply',data_addrtitle:'17 พฤศจิกายน 2569 เวลา 11:00:00 น.'}]}]};const r=parsePantipComments(data,{nativeThreadId:'100',threadUrl:'https://pantip.com/topic/100'},now);assert.equal(r.posts.length,2);assert.equal(r.posts[1].nativeParentPostId,'comment:2');assert.equal(r.posts[1].publishedDate,'2026-11-17T04:00:00.000Z');assert.equal(r.repliesComplete,false);
});
test('WN endpoint empty verified page completes, malformed or incomplete response does not',async()=>{const root={nativeThreadId:'100',threadUrl:'https://forum.test/threads/a.100',commentsEndpoint:'https://forum.test/get-comment'};const r=await collectComments({site:{...site,adapter:'wn'},root,read:async()=>({text:JSON.stringify({code:0,data:[],meta:{current_page:1,last_page:1,total:0}}),metadata:{}}),save:async()=>{}});assert.equal(r.complete,true);await assert.rejects(()=>collectComments({site:{...site,adapter:'wn'},root,read:async()=>({text:'{}'}),save:async()=>{}}),/WN_COMMENT_RESPONSE_INVALID/);});
test('backfill resume preserves original tail target while new pages arrive',async()=>{const s=await ForumState.open(':memory:');try{s.enqueue(site.domain,'https://forum.test/threads/a.100','100');let row=s.ready(site.domain,1)[0];assert.deepEqual(s.startScan(row,50),{target:50,floor:2});s.status(row,0,'page_limit_resume','https://forum.test/threads/a.100/page-40',0);row=s.ready(site.domain,1)[0];assert.deepEqual(s.startScan(row,60),{target:50,floor:2});s.completeScan(row,50,0);s.enqueue(site.domain,row.url,'100');row=s.ready(site.domain,1)[0];assert.deepEqual(s.startScan(row,60),{target:60,floor:49});}finally{s.close();}});
