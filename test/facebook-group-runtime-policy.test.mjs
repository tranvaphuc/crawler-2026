import test from 'node:test';import assert from 'node:assert/strict';
import {facebookGroupRuntimePolicy,retainGroupSession} from '../src/services/facebookGroupRuntimePolicy.js';
import {createFacebookSessionPool} from '../src/services/facebookSessionPool.js';
import {bindHttpState,HTTP_BINDING} from '../src/services/socialLeaseState.js';
import {runCrawlerQueue} from '../src/services/crawlerQueueContext.js';
test('existing runtime defaults remain unchanged and restored parameters are explicit',()=>{
 assert.deepEqual(facebookGroupRuntimePolicy({}),{pageSize:3,sessionMode:'shared',reuseAcrossSources:true});
 const restored=facebookGroupRuntimePolicy({CRAWL_FACEBOOK_GROUP_PAGE_SIZE:'100',CRAWL_FACEBOOK_GROUP_SESSION_MODE:'source'});
 assert.equal(restored.pageSize,100);assert.equal(retainGroupSession(restored),false);assert.equal(retainGroupSession(restored,{yielded:true}),true);
 for(const n of ['0','101','3.5','bad'])assert.throws(()=>facebookGroupRuntimePolicy({CRAWL_FACEBOOK_GROUP_PAGE_SIZE:n}));
 assert.throws(()=>facebookGroupRuntimePolicy({CRAWL_FACEBOOK_GROUP_SESSION_MODE:'bad'}));
});
test('source mode preserves its own live context and cannot borrow a different Group session',async()=>{
 await runCrawlerQueue('crawler-flow-facebook-group-source',async()=>{
  let released=0;const pool=createFacebookSessionPool(),state={},session={};
  const request=()=>{};bindHttpState(state,{session,facebookRequest:request,facebookRequestSession:session,endpoint:'allowed',lease:{managed:true,queue:'crawler-flow-facebook-group-source',scope:'facebook.source_group',expiresAt:Date.now()+300000},dispose:async()=>released++});
  try{
   await pool.put('group:one',state);
   assert.equal(await pool.take('group:two',{}, {transportScope:'facebook.source_group',sameSourceOnly:true}),false);
   assert.equal(pool.size,1);const resumed={};
   assert.equal(await pool.take('group:one',resumed,{transportScope:'facebook.source_group',sameSourceOnly:true}),true);
   assert.equal(resumed[HTTP_BINDING].facebookRequest,request);
   await pool.put('group:one',resumed);
   assert.equal(await pool.take('group:one',{}, {sameSourceOnly:true,excludeProxyEndpoints:['allowed']}),false);
  }finally{await pool.close();}assert.equal(released,1);
 });
});
