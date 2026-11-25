import test from 'node:test';import assert from 'node:assert/strict';
import {boundedProxyRead,FLOW_POLICY,FLOW_READ_TIMEOUT_MS,FLOW_QUEUES} from '../src/services/crawlerQueueFlow.js';
import {sourceRestrictionEvidence} from '../src/services/socialAuthGate.js';
import {createHttpExecutor} from '../src/services/socialHttpTransport.js';
const gate=(n,extra={})=>({good:false,result:{status:'auth_required',reason:'AUTH_REQUIRED',transport:{proxyEndpoint:String(n).repeat(64)},...extra}});
const success=n=>({good:true,result:{status:'ok',identityVerified:true,items:[{id:'1'}],transport:{proxyEndpoint:String(n).repeat(64)}}});
test('same page succeeds on a different proxy: gate is IP dependent and data is preserved',async()=>{
 const rows=[gate(1),success(2)],records=[],retries=[];let rotations=0;
 const r=await boundedProxyRead({verifyAuthGates:true,read:async()=>rows.shift(),rotate:async()=>rotations++,onGate:async r=>records.push(r.authGate),onRetry:async n=>retries.push(n)});
 assert.equal(r.good,true);assert.deepEqual(r.result.items,[{id:'1'}]);assert.equal(r.result.authGate.classification,'ip_or_route_dependent');assert.equal(r.result.authGate.confirmed,true);assert.equal(rotations,1);assert.deepEqual(retries,[1]);assert.equal(records.length,2);
});
test('three independent login gates retain done policy without pretending source privacy is proven',async()=>{
 let n=0,rotations=0,saved;
 const r=await boundedProxyRead({verifyAuthGates:true,read:async()=>gate(++n),rotate:async()=>rotations++,onFailure:async r=>saved=r});
 assert.equal(n,3);assert.equal(rotations,2);assert.equal(r.done,true);assert.equal(saved.reason,'AUTH_REQUIRED');assert.equal(saved.authGate.classification,'unverified');assert.equal(saved.authGate.confirmed,false);assert.equal(saved.authGate.distinctEndpoints,3);
});
test('explicit source age restriction is terminal immediately; generic invitations and script strings are not proof',async()=>{
 assert.equal(sourceRestrictionEvidence({html:'<p>Log in to continue</p>'}),null);
 assert.equal(sourceRestrictionEvidence({html:'<script>var x="Restricted profile. Log in"</script>'}),null);
 const evidence=sourceRestrictionEvidence({html:'<h1>Restricted profile</h1><p>You must be 13 years old. Log in to continue.</p>'});assert.equal(evidence.confirmed,true);
 const r=await boundedProxyRead({verifyAuthGates:true,read:async()=>gate(1,{authGate:evidence}),rotate:async()=>assert.fail('no rotate')});assert.equal(r.done,true);assert.equal(r.result.authGate.classification,'source_restriction');
});
test('gate after public pages is marked as such and keeps original terminal reason',async()=>{
 let n=0;const r=await boundedProxyRead({verifyAuthGates:true,publicBefore:true,read:async()=>gate(++n),rotate:async()=>{}});
 assert.equal(r.result.authGate.classification,'login_after_public_data');assert.equal(r.result.authGate.stage,'after_public_data');assert.equal(r.lastResult.reason,'AUTH_REQUIRED');
});
test('unavailable endpoint or exhausted retry budget cannot become source-private proof',async()=>{
 for(const initialRetries of [0,100]){let n=0;const r=await boundedProxyRead({verifyAuthGates:true,initialRetries,read:async()=>gate(1),rotate:async()=>{assert.ok(++n<3);}});assert.equal(r.done,true);assert.equal(r.lastResult.authGate.confirmed,false);}
});
test('transient failures between auth probes keep the existing rotation policy',async()=>{
 const rows=[gate(1),{good:false,result:{status:'error',reason:'ECONNRESET'}},success(2)];let changes=0;const r=await boundedProxyRead({verifyAuthGates:true,read:async()=>rows.shift(),rotate:async()=>changes++});assert.equal(changes,2);assert.equal(r.result.authGate.classification,'ip_or_route_dependent');
});
test('executor attaches explicit source restriction proof without retaining body or changing reason',async()=>{
 const execute=createHttpExecutor({respectPlatformCooldown:false,getProxy:async()=>({server:'http://test:1234'}),makeSession:()=>({request:async()=>({html:'<h1>Restricted profile</h1><p>You must be 13 years old. Log in</p>'}),close(){}})});
 const r=await execute({platform:'instagram'},async session=>{await session.request('https://www.instagram.com/test/');return {status:'auth_required',reason:'LOGIN_OR_CHECKPOINT'};});assert.equal(r.authGate.classification,'source_restriction');assert.equal(r.reason,'LOGIN_OR_CHECKPOINT');assert.ok(!JSON.stringify(r).includes('<h1>'));
});
test('operator budget, timeout and worker declarations stay unchanged with scoped origin cooldown policy',()=>{assert.equal(FLOW_POLICY,'independent-rounds-operator-error-policy-v12-facebook-proxy-rotation');assert.equal(FLOW_READ_TIMEOUT_MS,60000);assert.equal(FLOW_QUEUES.reduce((n,s)=>n+s.workers,0),458);});
test('a data-less successful wrapper does not prove a login gate is IP dependent',async()=>{
 const rows=[gate(1),{good:true,result:{status:'ok',transport:{proxyEndpoint:'2'.repeat(64)}}}];const r=await boundedProxyRead({verifyAuthGates:true,read:async()=>rows.shift(),rotate:async()=>{}});assert.equal(r.result.authGate.confirmed,false);assert.equal(r.result.authGate.classification,'unverified');
});
test('login comparison refreshes the session while retaining the exact Threads after cursor',async()=>{
 const {createMetaSourceHttpReader}=await import('../src/services/metaSourceHttp.js'),{normalizeContentInput}=await import('../src/services/socialContent.js'),{READ_STATE}=await import('../src/services/socialReadState.js'),{HTTP_BINDING,disposeReadState}=await import('../src/services/socialLeaseState.js');
 let acquired=0,posts=0;const cursors=[],excluded=[],context={};
 const post=id=>({pk:id,code:'P'+id,taken_at:1792900000,user:{pk:'9',username:'public'}}),conn=(id,next,cursor)=>({edges:[{node:{thread_items:[{post:post(id)}]}}],page_info:{has_next_page:next,end_cursor:cursor}});
 const initial='<script type="application/json">'+JSON.stringify({lsd:['LSD',[],{token:'private'}],query:{queryID:'123',queryName:'BarcelonaProfileTimelineQuery',variables:{userID:'9',after:null}},mediaData:conn('1',true,'EXACT_CURSOR')})+'</script>';
 const read=createMetaSourceHttpReader({respectPlatformCooldown:false,failFastProxy:true,getProxy:async t=>{excluded.push(t.excludeProxyEndpoint);return {server:'http://p'+(++acquired)+'.test:8080',managed:true,heartbeat:async()=>{},permit:async()=>{},report:async()=>({}),release:async()=>{}};},makeSession:()=>({requests:0,close(){},async request(url,opts){this.requests++;if(!opts)return {httpStatus:200,finalUrl:url,html:initial};cursors.push(JSON.parse(new URLSearchParams(opts.body).get('variables')).after);return ++posts===1?{httpStatus:200,finalUrl:url,html:JSON.stringify({errors:[{message:'LOGIN_REQUIRED',code:401}]})}:{httpStatus:200,finalUrl:url,html:JSON.stringify({data:{mediaData:conn('2',false,null)}})};}})});
 const target=normalizeContentInput('source',{url:'https://www.threads.com/@public',reference:{id:'9'}});let state=(await read({...target,proxyRetryContext:context}))[READ_STATE];
 try{const out=await boundedProxyRead({verifyAuthGates:true,publicBefore:true,read:async()=>{const result=await read({...target,proxyRetryContext:context,[READ_STATE]:state});state=result[READ_STATE]||state;context.excludeProxyEndpoint=result.transport?.proxyEndpoint;return {good:result.status==='ok',result};},rotate:async()=>{await disposeReadState(state);delete state[HTTP_BINDING];}});assert.equal(out.good,true);assert.deepEqual(cursors,['EXACT_CURSOR','EXACT_CURSOR']);assert.equal(acquired,2);assert.ok(excluded[1]);assert.equal(out.result.items[0].id,'2');assert.equal(out.result.authGate.classification,'ip_or_route_dependent');assert.equal(out.result.authGate.stage,'after_public_data');}finally{await disposeReadState(state);}
});

test('YouTube native channel age gate is proof even when the notice is rendered from JSON',()=>{
 const html='<script>var ytInitialData = '+JSON.stringify({contents:{channelAgeGateRenderer:{signInButton:{buttonRenderer:{}},mainText:{runs:[{text:'confirm you are old enough'}]}}}})+';</script>';
 assert.equal(sourceRestrictionEvidence({html}).evidence,'native_channel_age_gate');
 assert.equal(sourceRestrictionEvidence({html:'<script>var unrelated={channelAgeGateRenderer:{signInButton:{}}}</script>'}),null);
});
test('gate observation preserves session identity and fresh evidence across sticky native pages',async()=>{
 const binding={},sessions=[];let acquisitions=0,closes=0;
 const execute=createHttpExecutor({failFastProxy:true,respectPlatformCooldown:false,getProxy:async()=>{acquisitions++;return {server:'http://same.test:8080',managed:true,heartbeat:async()=>{},permit:async()=>{},report:async()=>({}),release:async()=>{}};},makeSession:()=>({requests:0,close(){closes++;},async request(){this.requests++;return {html:this.requests===2?'<h1>Restricted profile</h1><p>You must be 13 years old. Log in</p>':'public'};}})});
 try{await execute({platform:'instagram'},async session=>{sessions.push(session);await session.request('https://www.instagram.com/public/');return {status:'ok'};},binding);
 const r=await execute({platform:'instagram'},async session=>{sessions.push(session);await session.request('https://www.instagram.com/public/');return {status:'auth_required',reason:'LOGIN_OR_CHECKPOINT'};},binding);
 assert.equal(sessions[0],sessions[1]);assert.equal(r.authGate.evidence,'explicit_age_restriction');assert.equal(acquisitions,1);assert.equal(closes,1);
 }finally{await binding.dispose();}
});
test('Facebook source bootstraps once for two native pages on one managed session',async()=>{
 const {createFacebookContentHttpReader}=await import('../src/services/facebookContentHttp.js'),{READ_STATE}=await import('../src/services/socialReadState.js'),{disposeReadState}=await import('../src/services/socialLeaseState.js');let bootstrap=0,graphql=0,page=0;
 const read=createFacebookContentHttpReader({splitFacebookPages:true,respectPlatformCooldown:false,failFastProxy:true,getProxy:async()=>({server:'http://same.test:8080',managed:true,heartbeat:async()=>{},permit:async()=>{},report:async()=>({}),release:async()=>{}}),makeSession:()=>({requests:0,close(){},async request(url){this.requests++;if(url.endsWith('/api/graphql/')){graphql++;return {httpStatus:200,finalUrl:url,html:'{"data":{}}'};}bootstrap++;return {httpStatus:200,finalUrl:url,html:'<input name="lsd" value="private-token">'};}}),createPostFetcher:({request})=>async()=>{await request({fb_api_req_friendly_name:'GroupFeedQuery'},{});page++;return {posts:[{_id:String(page),created_time:1792900000,authorId:'9'}],cursor:'C'+page,hasNextPage:page<2};}});
 const target={operation:'source',platform:'facebook',sourceType:'group',id:'9',url:'https://www.facebook.com/groups/9',limit:100,order:'latest'};const first=await read(target);try{const second=await read({...target,[READ_STATE]:first[READ_STATE]});assert.equal(second.status,'partial');assert.equal(bootstrap,1);assert.equal(graphql,2);assert.equal(second.items[0].postId,'2');}finally{await disposeReadState(first[READ_STATE]);}
});
