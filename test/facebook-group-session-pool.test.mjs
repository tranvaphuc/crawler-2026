import test from 'node:test';import assert from 'node:assert/strict';
import {createFacebookContentHttpReader} from '../src/services/facebookContentHttp.js';import {createFacebookSessionPool} from '../src/services/facebookSessionPool.js';import {runCrawlerQueue} from '../src/services/crawlerQueueContext.js';import {READ_STATE} from '../src/services/socialReadState.js';import {HTTP_BINDING,disposeReadState} from '../src/services/socialLeaseState.js';
const queue='crawler-flow-facebook-group-source',target=id=>({platform:'facebook',operation:'source',sourceType:'group',id:String(id),url:'https://www.facebook.com/groups/'+id,limit:100,order:'latest'});
test('two different group jobs reuse only the healthy transport and bootstrap fresh source context',async()=>{
 await runCrawlerQueue(queue,async()=>{let acquisitions=0,closed=0,released=0;const bodies=[],gets=[],pool=createFacebookSessionPool();const getProxy=async()=>({host:'fixture',port:8080,managed:true,queue,scope:'facebook.source_group',expiresAt:Date.now()+300000,heartbeat:async()=>{},permit:async()=>{},report:async()=>{},release:async()=>released++,...(acquisitions++,{})});getProxy.managed=true;
 const read=createFacebookContentHttpReader({getProxy,reuseFacebookGroupSessions:true,respectPlatformCooldown:false,makeSession:({proxy})=>({requests:0,close(){closed++;},async request(url,opts){await proxy.beforeRequest();this.requests++;if(opts?.method==='POST'){bodies.push(new URLSearchParams(opts.body));return{httpStatus:200,html:'{"data":{}}',finalUrl:url};}gets.push(url);return{httpStatus:200,html:'<input name="lsd" value="nonce-'+(url.includes('/101')?'101':'202')+'">',finalUrl:url};}}),createPostFetcher:({request})=>async({groupId})=>{await request({fb_api_req_friendly_name:'Fixture',variables:JSON.stringify({id:groupId})},{});return{posts:[{_id:groupId+'1',authorId:'9',created_time:1700000000}],hasNextPage:false,cursor:null};}});
 try{const a=await read(target(101));assert.ok(a[READ_STATE]);assert.equal(closed,0);assert.equal(await pool.put('group:101',a[READ_STATE]),true);assert.equal(a[READ_STATE][HTTP_BINDING],undefined);
 const state={kind:'facebook',items:[],seen:new Set(),nativeCursor:null,pending:true,collecting:false};assert.equal(await pool.take('group:202',state,{transportScope:'facebook.source_group',minRemainingMs:60000}),true);const b=await read({...target(202),[READ_STATE]:state});assert.equal(acquisitions,1);assert.equal(gets.length,2);assert.equal(bodies[0].get('lsd'),'nonce-101');assert.equal(bodies[1].get('lsd'),'nonce-202');assert.equal(JSON.parse(bodies[1].get('variables')).id,'202');assert.deepEqual(b.items.map(x=>x.id),['202_2021']);assert.equal(await pool.put('group:202',b[READ_STATE]),true);
 }finally{await pool.close();}assert.equal(closed,1);assert.equal(released,1);
 });
});
test('pool never returns a group endpoint already failed by this job or a nearly expired lease',async()=>{
 await runCrawlerQueue(queue,async()=>{const pool=createFacebookSessionPool(),s={};const{bindHttpState}=await import('../src/services/socialLeaseState.js');bindHttpState(s,{endpoint:'a'.repeat(64),session:{},lease:{managed:true,queue,scope:'facebook.source_group',expiresAt:Date.now()+45000},dispose:async()=>{}});await pool.put('group:one',s);assert.equal(await pool.take('group:two',{}, {transportScope:'facebook.source_group',minRemainingMs:60000}),false);assert.equal(await pool.take('group:two',{}, {transportScope:'facebook.source_group',excludeProxyEndpoints:['a'.repeat(64)]}),false);await pool.close();});
});

test('resuming a group cursor from the pool keeps its anonymous context and avoids a second bootstrap',async()=>{
 await runCrawlerQueue(queue,async()=>{
  let gets=0,posts=0,acquired=0,released=0;const cursors=[],tokens=[],pool=createFacebookSessionPool();
  const getProxy=async()=>({host:'fixture',port:8080,managed:true,queue,scope:'facebook.source_group',expiresAt:Date.now()+300000,heartbeat:async()=>{},permit:async()=>{},report:async()=>{},release:async()=>released++,...(acquired++,{})});getProxy.managed=true;
  const read=createFacebookContentHttpReader({getProxy,reuseFacebookGroupSessions:true,respectPlatformCooldown:false,makeSession:({proxy})=>({requests:0,close(){},async request(url,opts){await proxy.beforeRequest();this.requests++;if(opts?.method==='POST'){posts++;tokens.push(new URLSearchParams(opts.body).get('lsd'));return{httpStatus:200,html:'{}',finalUrl:url};}gets++;return{httpStatus:200,html:'<input name="lsd" value="same-source-context">',finalUrl:url};}}),createPostFetcher:({request})=>async({cursor})=>{cursors.push(cursor);await request({variables:JSON.stringify({cursor})},{});return{posts:[{_id:String(posts),created_time:1700000000}],hasNextPage:true,cursor:'NEXT-'+posts};}});
  let resumed;
  try{
   const first=await read(target(101)),checkpoint=first[READ_STATE];assert.equal(checkpoint.nativeCursor,'NEXT-1');
   assert.equal(await pool.put('group:101',checkpoint),true);
   resumed={...checkpoint,items:[],seen:new Set(checkpoint.seen)};
   assert.equal(await pool.take('group:101',resumed,{transportScope:'facebook.source_group',minRemainingMs:60000}),true);
   const next=await read({...target(101),[READ_STATE]:resumed});resumed=next[READ_STATE];
   assert.deepEqual(cursors,[null,'NEXT-1']);assert.equal(resumed.nativeCursor,'NEXT-2');
   assert.equal(gets,1);assert.equal(posts,2);assert.deepEqual(tokens,['same-source-context','same-source-context']);assert.equal(acquired,1);
   assert.equal(await pool.put('group:101',resumed),true);
  }finally{await disposeReadState(resumed);await pool.close();}
  assert.equal(released,1);
 });
});

test('a sliced group reserves its context briefly for its own cursor, then allows other sources',async()=>{
 let clock=100000,released=0;const pool=createFacebookSessionPool({now:()=>clock});
 const {bindHttpState}=await import('../src/services/socialLeaseState.js');
 const store=async()=>{const state={},session={};bindHttpState(state,{session,facebookRequest:()=>{},facebookRequestSession:session,lease:{managed:true,queue,scope:'facebook.source_group',expiresAt:clock+300000},dispose:async()=>released++});assert.equal(await pool.put('group:101',state,{sameSourceForMs:2000}),true);};
 try{await runCrawlerQueue(queue,async()=>{
  await store();assert.equal(await pool.take('group:202',{}, {transportScope:'facebook.source_group'}),false);
  const own={};assert.equal(await pool.take('group:101',own,{transportScope:'facebook.source_group'}),true);assert.equal(typeof own[HTTP_BINDING].facebookRequest,'function');
  assert.equal(await pool.put('group:101',own,{sameSourceForMs:2000}),true);
  clock+=1999;assert.equal(await pool.take('group:202',{}, {transportScope:'facebook.source_group'}),false);
  clock++;const other={};assert.equal(await pool.take('group:202',other,{transportScope:'facebook.source_group'}),true);
  assert.equal(other[HTTP_BINDING].facebookRequest,undefined);await other[HTTP_BINDING].dispose();
 });}finally{await pool.close();}assert.equal(released,1);
});

test('source affinity never bypasses endpoint exclusions, queue isolation or lease expiry',async()=>{
 let clock=100000,disposed=0;const pool=createFacebookSessionPool({now:()=>clock}),{bindHttpState}=await import('../src/services/socialLeaseState.js');
 try{await runCrawlerQueue(queue,async()=>{const s={};bindHttpState(s,{endpoint:'a'.repeat(64),session:{},lease:{managed:true,queue,scope:'facebook.source_group',expiresAt:clock+61000},dispose:async()=>disposed++});assert.equal(await pool.put('group:101',s,{sameSourceForMs:2000}),true);
  assert.equal(await pool.take('group:101',{}, {excludeProxyEndpoints:['a'.repeat(64)]}),false);
  await runCrawlerQueue('crawler-flow-facebook-page-source',async()=>assert.equal(await pool.take('group:101',{}, {transportScope:'facebook.source_group'}),false));
  clock+=1500;assert.equal(await pool.take('group:101',{}, {minRemainingMs:60000}),false);
 });}finally{await pool.close();}assert.equal(disposed,1);
});
