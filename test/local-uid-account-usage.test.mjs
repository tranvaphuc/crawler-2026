import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';
import {createLocalUidAccountUsage} from '../src/services/localUidAccountUsage.js';
import {trackedUidRequest} from '../src/services/localUidTrackedRequest.js';
import {facebookProfileDiagnostics,readFacebookProfileWithProof} from '../src/services/facebookProfileDiagnostics.js';
const config=(account='1001',session='PRIVATE_AUTH')=>'header = '+JSON.stringify('cookie: c_user='+account+'; xs='+session+';')+'\n';
const setup=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uid-usage-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
test('account counters span header sessions and restarts; cache/shared jobs never inflate real UID proofs',t=>{
 const dir=setup(t),u=createLocalUidAccountUsage({dir}),a=config(),b=config('1001','NEW_PRIVATE_AUTH'),c=config('2002');u.register(a,'Phúc 1');
 const x=u.start(a,{target:'https://www.facebook.com/a'});u.finish(x,{httpStatus:200,numRedirects:1,curlExit:0});u.observe({httpStatus:200,uidUsageRef:x},{proof:{id:'123456'}});u.observe({httpStatus:200,uidUsageRef:x},{proof:{id:'123456'}});
 u.jobResolved(x,{jobId:'one',source:'network'});u.jobResolved(x,{jobId:'two',source:'shared_request'});u.jobResolved(u.context(b),{jobId:'three',source:'memory_cache'});
 const v=createLocalUidAccountUsage({dir}),y=v.start(b,{purpose:'health_probe',target:'https://www.facebook.com/a'});v.finish(y,{httpStatus:200,curlExit:0});v.observe({httpStatus:200,uidUsageRef:y},{proof:{id:'123456'}});
 const z=u.start(c,{purpose:'header_validation',target:'https://www.facebook.com/b'});u.finish(z,{httpStatus:200,curlExit:0});
 const r=u.report(),account=r.accounts.find(x=>x.profileLabel==='Phúc 1');assert.equal(r.accounts.length,2);assert.equal(r.sessions.length,3);assert.equal(account.requestAttempts,2);assert.equal(account.httpRequestsConfirmed,3);assert.equal(account.nativeUidProofs,2);assert.equal(account.uniqueNativeUids,1);assert.equal(account.cacheJobs,1);assert.equal(account.sharedRequestJobs,1);assert.equal(account.resolvedJobs,3);
 assert.doesNotMatch(fs.readFileSync(u.journal,'utf8'),/PRIVATE_AUTH|NEW_PRIVATE_AUTH|c_user|cookie|xs=|123456/);assert.equal(fs.statSync(u.journal).mode&0o777,0o600);assert.equal(fs.statSync(path.join(dir,'uid-account-usage.salt.credentials.json')).mode&0o777,0o600);
});
test('first rate signal freezes its counters; explicit feature block remains separate from HTTP429/profile errors',t=>{
 const dir=setup(t);let at='2026-11-01T00:00:00.000Z';const u=createLocalUidAccountUsage({dir,now:()=>at}),a=config();
 const x=u.start(a,{target:'https://www.facebook.com/a'}),y=u.start(a,{target:'https://www.facebook.com/b'});u.finish(x,{httpStatus:429,curlExit:0});at='2026-11-01T00:00:01.000Z';u.observe({httpStatus:429,uidUsageRef:x});
 u.finish(y,{httpStatus:200,curlExit:0});u.observe({httpStatus:200,uidUsageRef:y},{diagnostic:{reason:'FACEBOOK_PROFILE_ERROR_ROUTE'}});let r=u.report().accounts[0];assert.equal(r.firstLimitObserved.httpRequestsConfirmed,1);assert.equal(r.firstLimitObserved.inFlight,1);assert.equal(r.firstFeatureBlockObserved,null);
 at='2026-11-01T00:00:02.000Z';u.observe({httpStatus:200,uidUsageRef:y},{diagnostic:{limitEvidence:'TEMPORARY_FEATURE_BLOCK'}});r=u.report().accounts[0];assert.equal(r.firstLimitObserved.observedAt,'2026-11-01T00:00:01.000Z');assert.equal(r.firstFeatureBlockObserved.observedAt,at);assert.equal(r.firstFeatureBlockObserved.requestOrdinal,2);assert.equal(r.firstFeatureBlockObserved.requestStartsLast60s,2);assert.equal(r.limitSignals,2);
});
test('failed HTTP transfers expose uncertainty instead of pretending all attempts were requests sent',t=>{
 const dir=setup(t),u=createLocalUidAccountUsage({dir});for(const [exit,size]of [[6,0],[28,100]]){const x=u.start(config(),{target:'https://www.facebook.com/a'});u.finish(x,{httpStatus:0,curlExit:exit,sizeRequest:size});}const r=u.report().accounts[0];assert.equal(r.requestAttempts,2);assert.equal(r.httpRequestsConfirmed,0);assert.equal(r.httpRequestsUncertain,1);assert.equal(r.transportErrors,2);
});
test('request pins private config while refresh switches account, counts redirects, and deletes the snapshot',async t=>{
 const dir=setup(t),u=createLocalUidAccountUsage({dir}),p=path.join(dir,'curl.credentials.conf'),a=config(),b=config('2002');fs.writeFileSync(p,a,{mode:0o600});let pinned;
 const snapshot=await trackedUidRequest({dir,url:'https://www.facebook.com/a',usage:u,spawnImpl:(_exe,args)=>{pinned=args[args.indexOf('--config')+1];assert.equal(fs.readFileSync(pinned,'utf8'),a);assert.equal(fs.statSync(pinned).mode&0o777,0o600);assert.doesNotMatch(args.join(' '),/PRIVATE_AUTH|c_user/);fs.writeFileSync(p,b);const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();process.nextTick(()=>{child.stdout.end('<html/>\n200\n1\n234\nhttps://www.facebook.com/a');child.stderr.end();child.emit('close',0);});return child;}});
 assert.equal(snapshot.uidUsageRef.accountKey,u.context(a).accountKey);assert.notEqual(snapshot.uidUsageRef.accountKey,u.context(b).accountKey);assert.equal(fs.existsSync(pinned),false);assert.equal(u.report().accounts[0].httpRequestsConfirmed,2);
});
test('missing curl accounting after a failed transfer remains explicitly uncertain',async t=>{
 const dir=setup(t),usage=createLocalUidAccountUsage({dir});fs.writeFileSync(path.join(dir,'curl.credentials.conf'),config(),{mode:0o600});
 await assert.rejects(trackedUidRequest({dir,url:'https://www.facebook.com/a',usage,spawnImpl:()=>{const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();process.nextTick(()=>{c.stdout.end('partial HTML only');c.stderr.end();c.emit('close',28);});return c;}}),/LOCAL_CURL_EXIT_28/);
 const row=usage.report().accounts[0];assert.equal(row.httpRequestsConfirmed,0);assert.equal(row.httpRequestsUncertain,1);assert.equal(row.inFlight,0);assert.equal(fs.readdirSync(dir).some(x=>x.startsWith('.uid-request-')),false);
});
const route=(name,props)=>({httpStatus:200,finalUrl:'https://www.facebook.com/a',html:'<script type="application/json">'+JSON.stringify({initialRouteInfo:{route:{canonicalRouteName:name,rootView:{props}}}})+'</script>'});
test('only native error-route block evidence is classified, never profile text or a generic error page',()=>{
 const props={title:'You’re Temporarily Blocked',body:'It looks like you were misusing this feature by going too fast.'};
 assert.equal(facebookProfileDiagnostics(route('CometErrorRoute',props),'https://www.facebook.com/a').limitEvidence,'TEMPORARY_FEATURE_BLOCK');
 assert.equal(facebookProfileDiagnostics(route('ProfileCometTimelineRoute',props),'https://www.facebook.com/a').limitEvidence,undefined);
 assert.equal(facebookProfileDiagnostics(route('CometErrorRoute',{title:'Content unavailable',body:'Not found'}),'https://www.facebook.com/a').limitEvidence,undefined);
});
test('profile reader exposes the actual response context on both diagnostic attempts',async()=>{
 const observed=[];await assert.rejects(readFacebookProfileWithProof({url:'https://www.facebook.com/a',request:async()=>({...route('CometErrorRoute',{}),uidUsageRef:{accountKey:'a'}}),onResult:async x=>observed.push(x)}),/ERROR_ROUTE/);assert.equal(observed.length,2);assert.equal(observed[0].snapshot.uidUsageRef.accountKey,'a');
});
test('bulk route request keeps auth form out of process arguments and preserves session attribution',async t=>{
 const dir=setup(t),usage=createLocalUidAccountUsage({dir}),base=config();fs.writeFileSync(path.join(dir,'curl.credentials.conf'),base,{mode:0o600});let pinned;
 const routeForm={fb_dtsg:'PRIVATE_CSRF',__user:'1001','route_urls[0]':'/pfbidAbCdEfGh123'};
 const snapshot=await trackedUidRequest({dir,url:'https://www.facebook.com/ajax/bulk-route-definitions/',routeForm,usage,spawnImpl:(_exe,args)=>{pinned=args[args.indexOf('--config')+1];const request=fs.readFileSync(pinned,'utf8');assert.match(request,/PRIVATE_CSRF/);assert.match(request,/content-type: application\/x-www-form-urlencoded/);assert.doesNotMatch(args.join(' '),/PRIVATE_CSRF|PRIVATE_AUTH/);const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();process.nextTick(()=>{child.stdout.end('{}\n200\n0\n123\nhttps://www.facebook.com/ajax/bulk-route-definitions/');child.stderr.end();child.emit('close',0);});return child;}});
 assert.equal(snapshot.uidUsageRef.sessionKey,usage.context(base).sessionKey);assert.equal(fs.existsSync(pinned),false);
 await assert.rejects(trackedUidRequest({dir,url:'https://www.facebook.com/elsewhere',routeForm,usage}),/INVALID_UID_ROUTE_ENDPOINT/);
});
