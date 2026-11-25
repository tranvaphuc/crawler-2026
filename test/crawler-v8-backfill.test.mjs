import test from 'node:test';import assert from 'node:assert/strict';
import {encodeBackfillState,decodeBackfillState,backfillOutcome} from '../src/services/crawlerV8Backfill.js';
import {HTTP_BINDING} from '../src/services/socialLeaseState.js';
test('checkpoint resumes cursors, buffered rows, sets and reply maps without persisting a live session',()=>{
 const s={kind:'facebook',nativeCursor:'native-page-2',items:[{id:'1',text:'post'}],seen:new Set(['1']),expectedReplies:new Map([['1',2]]),observedReplies:new Map([['1',new Set(['2'])]]),base:{coverage:{complete:false},transport:{secret:'excluded'}},transport:{secret:'excluded'},originTransport:{secret:'excluded'},session:{cookie:'excluded'}};s[HTTP_BINDING]={dispose(){},cookie:'excluded'};
 const r=decodeBackfillState(encodeBackfillState(s));assert.equal(r.nativeCursor,'native-page-2');assert.ok(r.seen.has('1'));assert.ok(r.observedReplies.get('1').has('2'));assert.equal(r.transport,undefined);assert.equal(r.originTransport,undefined);assert.equal(r.session,undefined);assert.equal(r.base.transport,undefined);assert.equal(r[HTTP_BINDING],undefined);
});
test('native continuation stays runnable and cannot be counted complete',()=>{const r=backfillOutcome({kind:'source',result:{pagination:{hasMore:true},coverage:{exhausted:false}},state:{nativeCursor:'next'},now:1000});assert.equal(r.state,'retry');assert.equal(r.backfillComplete,false);assert.equal(r.nextAt.getTime(),2000);});
test('exhausting a verified native source window can complete even though upstream makes no private coverage claim',()=>{const r=backfillOutcome({kind:'source',result:{pagination:{hasMore:false},coverage:{exhausted:true,complete:false}},state:null});assert.equal(r.state,'done');assert.equal(r.windowCovered,true);});
test('unavailable pagination never masquerades as a fully scanned source',()=>{const r=backfillOutcome({kind:'source',result:{pagination:{hasMore:null,reason:'NATIVE_PAGINATION_UNAVAILABLE'},coverage:{exhausted:false}},state:null,now:1000});assert.equal(r.state,'partial');assert.equal(r.backfillComplete,false);assert.equal(r.nextAt.getTime(),1801000);});
test('unknown exact dates or quarantined records prevent completion even after window exhaustion',()=>{for(const extra of [{unknown:1},{rejected:1}]){const r=backfillOutcome({kind:'source',result:{pagination:{hasMore:false},coverage:{exhausted:true}},state:null,...extra});assert.equal(r.windowCovered,true);assert.equal(r.backfillComplete,false);}});
test('locally sorted old pages do not prove the lower date boundary; a verified server cutoff does',()=>{const result={pagination:{hasMore:true},coverage:{exhausted:false}};assert.equal(backfillOutcome({kind:'source',result,state:{}}).backfillComplete,false);assert.equal(backfillOutcome({kind:'source',result,state:{},verifiedSince:true}).backfillComplete,true);});
test('comment completion requires stronger count and coverage evidence',()=>{assert.equal(backfillOutcome({kind:'comments',result:{pagination:{hasMore:false},coverage:{exhausted:true,complete:false}},state:null}).backfillComplete,false);assert.equal(backfillOutcome({kind:'comments',result:{pagination:{hasMore:false},coverage:{exhausted:true,complete:true}},state:null}).backfillComplete,true);});
import {createFacebookContentHttpReader} from '../src/services/facebookContentHttp.js';
import {normalizeContentInput} from '../src/services/socialContent.js';import {READ_STATE} from '../src/services/socialReadState.js';
const proxy={server:'http://proxy.test:8888'};
const noNetwork=()=>({requests:0,close(){},request(){throw Error('unexpected network');}});
test('Facebook source resumes the exact saved native cursor after reader restart',async()=>{
 const cursors=[];const createPostFetcher=()=>async input=>{cursors.push(input.cursor);const first=input.cursor===null;return{posts:[{_id:first?'11':'12',created_time:1790500000,authorId:'123',content:'real-shaped fixture',comment:0}],cursor:first?'second-native-page':null,hasNextPage:first};};
 const options={getProxy:async()=>proxy,makeSession:noNetwork,createPostFetcher};const t=normalizeContentInput('source',{url:'https://www.facebook.com/123',sourceType:'page',limit:20,count:'all'});
 const a=await createFacebookContentHttpReader(options)(t);const saved=decodeBackfillState(encodeBackfillState(a[READ_STATE]));
 const b=await createFacebookContentHttpReader(options)(Object.defineProperty({...t},READ_STATE,{value:saved}));assert.deepEqual(cursors,[null,'second-native-page']);assert.equal(b.items[0].id,'123_12');assert.equal(b.pagination.hasMore,false);assert.equal(b.coverage.exhausted,true);
});
test('crawler comment streaming commits a batch before the root continuation is exhausted and resumes its reply maps',async()=>{
 const cursors=[];const createCommentFetcher=()=>async input=>{cursors.push(input.cursor);const first=input.cursor===null;return{comments:[{_id:first?'21':'22',authorId:'123',author:'A',content:'comment',time:'2026-10-25T10:00:00Z',repliesCount:0}],cursor:first?'second-root-page':null,hasNextPage:first,ordering:{unfilteredVerified:true}};};
 const options={getProxy:async()=>proxy,makeSession:noNetwork,createCommentFetcher,maxPages:1,streamComments:true};const t=normalizeContentInput('comments',{url:'https://www.facebook.com/123_11',limit:100,count:'all'});
 const a=await createFacebookContentHttpReader(options)(t);assert.equal(a.count,1);assert.equal(a.pagination.hasMore,true);const saved=decodeBackfillState(encodeBackfillState(a[READ_STATE]));
 const b=await createFacebookContentHttpReader(options)(Object.defineProperty({...t},READ_STATE,{value:saved}));assert.equal(b.count,1);assert.equal(b.items[0].id,'22');assert.deepEqual(cursors,[null,'second-root-page']);assert.equal(b.pagination.hasMore,false);
});
import {drainPinnedBackfill} from '../src/services/crawlerV8Backfill.js';
import {classifyCrawlResult} from '../src/services/crawlerV8Es5.js';
for(const kind of ['source','comments'])test(`pinned ${kind} drains over 500 pages in a single claim before another job can start`,async()=>{
 let reads=0,pages=0,retries=0;const terminal=701;
 const r=await drainPinnedBackfill({read:async state=>{const n=(state?.page||0)+1;reads++;return{value:{status:'partial',pagination:{hasMore:n<terminal}},state:n<terminal?{page:n}:null};},onData:async()=>{pages++;return false;},onRetry:async()=>{retries++;},wait:async()=>{},classify:classifyCrawlResult});
 assert.equal(reads,terminal);assert.equal(pages,terminal);assert.equal(retries,0);assert.equal(r.state,null);assert.equal(r.blocked,undefined);
});
test('rate limit and network retry retain the same continuation and obey Retry-After without releasing the job',async()=>{
 const original={nativeCursor:'page-2'};let n=0;const seen=[],delays=[],errors=[];
 const r=await drainPinnedBackfill({initialState:original,read:async state=>{seen.push(state);n++;return n===1?{value:{status:'rate_limited',reason:'FACEBOOK_RATE_LIMITED',retryAfterMs:900000},state}:n===2?{value:{status:'error',reason:'UPSTREAM_NETWORK_ERROR'},state}:{value:{status:'partial',pagination:{hasMore:false}},state:null};},onData:async()=>false,onRetry:async(v,s)=>{assert.equal(s,original);errors.push(v.reason);},wait:async delay=>delays.push(delay),classify:classifyCrawlResult});
 assert.deepEqual(seen,[original,original,original]);assert.deepEqual(delays,[900000,2000]);assert.deepEqual(errors,['FACEBOOK_RATE_LIMITED','UPSTREAM_NETWORK_ERROR']);assert.equal(r.blocked,undefined);
});
test('shutdown while waiting preserves the current cursor for restart and makes no additional request',async()=>{
 let stop=false,reads=0;const state={nativeCursor:'keep-me'};
 const r=await drainPinnedBackfill({initialState:state,read:async()=>{reads++;return{value:{status:'error',reason:'UPSTREAM_TIMEOUT'},state};},onData:async()=>false,onRetry:async()=>{},wait:async()=>{stop=true;},shouldStop:()=>stop,classify:classifyCrawlResult});
 assert.equal(reads,1);assert.equal(r.state,state);assert.equal(r.stopped,true);
});
test('an authentication gate is blocked with the cursor preserved, never counted as finished',async()=>{
 const state={nativeCursor:'keep-me'};let waited=false;
 const r=await drainPinnedBackfill({initialState:state,read:async()=>({value:{status:'auth_required',reason:'AUTH_REQUIRED'},state}),onData:async()=>{throw Error('cannot stage');},onRetry:async()=>{throw Error('cannot retry auth');},wait:async()=>{waited=true;},classify:classifyCrawlResult});
 assert.equal(r.blocked,true);assert.equal(r.state,state);assert.equal(waited,false);
});
test('a thrown network error also retries the same native cursor within one claim',async()=>{
 let n=0;const state={nativeCursor:'same'};const seen=[];
 const r=await drainPinnedBackfill({initialState:state,read:async s=>{seen.push(s);if(++n===1)throw Object.assign(Error('network'),{code:'UPSTREAM_NETWORK_ERROR'});return{value:{status:'partial',pagination:{hasMore:false}},state:null};},onData:async()=>false,onRetry:async()=>{},wait:async()=>{},classify:classifyCrawlResult});assert.equal(n,2);assert.deepEqual(seen,[state,state]);assert.equal(r.blocked,undefined);
});
test('a repeated native continuation without new items is held instead of hammering forever or claiming completion',async()=>{
 const state={kind:'facebook',nativeCursor:'stalled',seen:new Set(),items:[],pending:true};let n=0;
 const r=await drainPinnedBackfill({initialState:state,read:async()=>{n++;return{value:{status:'partial',items:[],pagination:{hasMore:true}},state};},onData:async()=>false,onRetry:async()=>{},wait:async()=>{},classify:classifyCrawlResult});assert.equal(n,3);assert.equal(r.blocked,true);assert.equal(r.result.reason,'NATIVE_PAGINATION_STALLED');assert.equal(r.state,state);
});
import {rotateReadStateProxy} from '../src/services/socialLeaseState.js';
import {createHttpExecutor} from '../src/services/socialHttpTransport.js';
test('20 limit retries request fresh leases, then skip the unfinished job on the 21st failed read',async()=>{
 let reads=0,rotations=0,notifications=0;const delays=[],state={nativeCursor:'resume-here'};
 const r=await drainPinnedBackfill({initialState:state,read:async s=>{assert.equal(s,state);reads++;return{value:{status:'rate_limited',reason:'HTTP_429',retryAfterMs:900000},state:s};},onData:async()=>false,onRetry:async(v,s,d,n)=>{notifications++;assert.equal(n,notifications);},rotateProxy:async()=>{rotations++;return true;},wait:async d=>delays.push(d),classify:classifyCrawlResult});
 assert.equal(reads,21);assert.equal(rotations,20);assert.equal(notifications,20);assert.ok(delays.every(x=>x===1000));assert.equal(r.retryExhausted,true);assert.equal(r.retries,20);assert.equal(r.state,state);
});
test('the final allowed retry can succeed without skipping the job',async()=>{
 let reads=0;const r=await drainPinnedBackfill({read:async()=>({value:++reads<=20?{status:'error',reason:'UPSTREAM_TIMEOUT'}:{status:'partial',pagination:{hasMore:false}},state:null}),onData:async()=>false,onRetry:async()=>{},wait:async()=>{},classify:classifyCrawlResult});assert.equal(reads,21);assert.equal(r.retryExhausted,undefined);
});
test('a restart retains the remaining retry budget instead of creating 20 more retries',async()=>{
 let reads=0;const r=await drainPinnedBackfill({initialRetries:19,read:async()=>{reads++;return{value:{status:'error',reason:'UPSTREAM_TIMEOUT'},state:null};},onData:async()=>false,onRetry:async()=>{},wait:async()=>{},classify:classifyCrawlResult});assert.equal(reads,2);assert.equal(r.retryExhausted,true);
});
test('a global/API pool cooldown is waited out and never bypassed by lease rotation',async()=>{
 let stop=false,rotations=0,delay;await drainPinnedBackfill({read:async()=>({value:{status:'rate_limited',reason:'PROXY_SCOPE_COOLDOWN',retryAfterMs:900000},state:null}),onData:async()=>false,onRetry:async()=>{},rotateProxy:async()=>{rotations++;return true;},wait:async d=>{delay=d;stop=true;},shouldStop:()=>stop,classify:classifyCrawlResult});assert.equal(rotations,0);assert.equal(delay,900000);
});
test('explicit rate retry detaches the old proxy and acquires a different lease while retaining its API cooldown report',async()=>{
 let acquisitions=0,releases=0;const reports=[];const getProxy=async()=>({managed:true,host:'proxy-'+(++acquisitions),port:8080,expiresAt:Date.now()+600000,heartbeat:async()=>{},permit:async()=>{},report:async value=>{reports.push(value);return{retryAfterMs:120000};},release:async()=>{releases++;}});getProxy.managed=true;
 const run=createHttpExecutor({getProxy,makeSession:({proxy})=>({host:proxy.host,requests:0,setDeadline(){},close(){}})}),binding={},state={};Object.defineProperty(state,HTTP_BINDING,{value:binding});
 const first=await run({platform:'facebook',operation:'comments'},async()=>({status:'rate_limited',reason:'HTTP_429',retryAfterMs:120000}),binding);assert.equal(first.status,'rate_limited');assert.ok(binding.blockedUntil>Date.now());await rotateReadStateProxy(state);assert.equal(binding.blockedUntil,0);
 let host,changed;await run({platform:'facebook',operation:'comments'},async(s,d,m)=>{host=s.host;changed=m.sessionChanged;return{status:'partial'};},binding);assert.equal(host,'proxy-2');assert.equal(changed,true);assert.equal(reports[0].retryAfterMs,120000);assert.equal(releases,1);await binding.dispose();
});
test('a login/checkpoint terminal binding cannot be cleared by rate retry',async()=>{
 const binding={terminal:{status:'auth_required'},blockedUntil:12345},state={};Object.defineProperty(state,HTTP_BINDING,{value:binding});assert.equal(await rotateReadStateProxy(state),false);assert.equal(binding.blockedUntil,12345);
});

import {crawlRetryDelay} from '../src/services/crawlerV8Backfill.js';
test('manager pacing and local backoff retain their requested wait without exponential amplification',()=>{
 for(const retries of [1,7,20])for(const reason of ['PROXY_PACING_WAIT','PROXY_RETRY_LATER','PROXY_POOL_BUSY'])assert.equal(crawlRetryDelay({status:'proxy_error',reason,retryAfterMs:1500},retries),1500);
 for(const reason of ['API_COOLDOWN','PROXY_SCOPE_COOLDOWN'])assert.equal(crawlRetryDelay({status:'rate_limited',reason,retryAfterMs:900000},20,{rotated:true}),900000);
});
test('generic failures have short bounded backoff while explicit upstream Retry-After remains authoritative',()=>{
 const delays=Array.from({length:20},(_,n)=>crawlRetryDelay({status:'unavailable',reason:'SOURCE_OR_POST_UNAVAILABLE'},n+1));assert.equal(Math.max(...delays),30000);assert.equal(delays.reduce((a,b)=>a+b,0),481000);
 assert.equal(crawlRetryDelay({status:'error',reason:'UPSTREAM_API_ERROR',retryAfterMs:120000},20),120000);
});
test('network failures rotate a permitted lease and retain the native checkpoint through the same 20-retry budget',async()=>{
 const state={nativeCursor:'same-page'},delays=[];let reads=0,rotations=0;const r=await drainPinnedBackfill({initialState:state,read:async s=>{reads++;assert.equal(s,state);return{value:{status:'error',reason:'NETWORK_ERROR'},state:s};},onData:async()=>false,onRetry:async(v,s,d,n,m)=>{assert.equal(s,state);assert.equal(m.proxyRotationRequested,true);},rotateProxy:async()=>{rotations++;return true;},wait:async d=>delays.push(d),classify:classifyCrawlResult});assert.equal(reads,21);assert.equal(rotations,20);assert.equal(r.retryExhausted,true);assert.equal(r.state,state);assert.ok(delays.every(d=>d===1000));
});
