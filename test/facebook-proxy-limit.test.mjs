import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedProxyRead,FLOW_RETRY_LIMIT,flowReadAction} from '../src/services/crawlerQueueFlow.js';
import {createHttpExecutor} from '../src/services/socialHttpTransport.js';
import {proxyEndpoint} from '../src/services/proxyEndpoint.js';
import {rememberProxyFailure,proxyExclusions} from '../src/services/proxyAvoidance.js';
import {createOriginCooldowns} from '../src/services/crawlerOriginCooldown.js';
import {createOriginWorkerGate} from '../src/services/originWorkerGate.js';

test('Facebook limit rotates to a different endpoint with exact cursor; source-page remains independent',async()=>{
 const context={},state={cursor:'native+/cursor==',pending:[{id:'exact-comment'}]},acquired=[],reports=[];
 let next=0,retries=0,closed=0;
 const proxies=['a','b'].map(host=>({server:'http://proxy-'+host+':8080',scope:'facebook.comments',managed:true,heartbeat:async()=>{},permit:async()=>{},release:async()=>{},report:async r=>{reports.push(r);return{};}}));
 const execute=createHttpExecutor({failFastProxy:true,timeoutMs:500,getProxy:async target=>{acquired.push(target);const p=proxies[next++];if(next===2)assert.deepEqual(target.excludeProxyEndpoints,[proxyEndpoint(proxies[0])]);return p;},makeSession:()=>({requests:0,close(){closed++;}})});
 const outcome=await boundedProxyRead({originScope:'facebook:origin',read:async()=>{
  const result=await execute({platform:'facebook',operation:'comments',proxyRetryContext:context},async()=>next===1?{status:'rate_limited',reason:'FACEBOOK_RATE_LIMITED',retryAfterMs:900000}:{status:'ok'});
  if(result.status!=='ok')rememberProxyFailure(context,result);
  return{good:result.status==='ok',result,state};
 },rotate:async()=>{},onRetry:async n=>{retries=n;},onOriginWait:async()=>assert.fail('Facebook must never wait globally')});
 assert.equal(outcome.good,true);assert.equal(outcome.state,state);assert.equal(retries,1);assert.equal(acquired.length,2);assert.equal(closed,2);
 assert.equal(reports[0].reason,'FACEBOOK_RATE_LIMITED');assert.equal(reports[0].status,'error');
 assert.deepEqual(proxyExclusions({}),[],'another job/source has no inherited exclusions');
});
test('Facebook HTTP429 rotates within bounded budget, other platforms still use their own policy',async()=>{
 for(const reason of ['FACEBOOK_RATE_LIMITED','UPSTREAM_HTTP_429','HTTP_429','API_COOLDOWN']){
  assert.equal(flowReadAction({status:'rate_limited',reason},{originScope:'facebook:origin'}),'rotate');
 }
 let calls=0,rotations=0,failures=0;
 const r=await boundedProxyRead({originScope:'facebook:origin',initialRetries:FLOW_RETRY_LIMIT-1,read:async()=>{calls++;return{good:false,result:{status:'rate_limited',reason:'FACEBOOK_RATE_LIMITED'}};},rotate:async()=>rotations++,onFailure:async()=>failures++});
 assert.equal(r.exhausted,true);assert.equal(calls,2);assert.equal(rotations,1);assert.equal(failures,1);
 assert.equal(flowReadAction({status:'rate_limited',reason:'UPSTREAM_HTTP_429'},{originScope:'threads:origin'}),'origin_wait');
 assert.equal(flowReadAction({status:'security_checkpoint',reason:'ORIGIN_SECURITY_CHALLENGE'},{originScope:'facebook:origin'}),'fail');
});
test('historical Facebook cooldown cannot restore or pause source/comment/reply intake',async()=>{
 const published=[];
 const control=createOriginCooldowns({redis:{eval:async(...a)=>published.push(a),pttl:async()=>assert.fail('must ignore historical Facebook key')},collection:{find:()=>({toArray:async()=>[{_id:'facebook:origin',until:new Date(Date.now()+900000)}]})}});
 await control.restore();assert.equal(await control.remaining('facebook:origin'),0);assert.deepEqual(published,[]);
 await assert.rejects(control.defer('facebook:origin',{reason:'FACEBOOK_RATE_LIMITED'}),/REQUIRES_PROXY_ROTATION/);
 const gate=createOriginWorkerGate({remaining:async()=>900000});
 for(const kind of ['source','comments','reply'])assert.equal(gate.register({platform:'facebook',kind,name:kind==='source'?'facebook-group-source':kind==='reply'?'facebook-reply':'facebook-comment'},{pause:async()=>assert.fail('must not pause Facebook')}),false);
 await gate.sync();assert.deepEqual(gate.status(),[]);await gate.close();
});
