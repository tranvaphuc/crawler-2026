import test from 'node:test';import assert from 'node:assert/strict';
import {profileUidFromSnapshot,uidLookupUrl,needsUidLookup,findFacebookUid,operatorSuppliedUid} from '../src/services/facebookFindUid.js';
import {handoffUidImport,migrateFailedUidImport,enqueueUidResolvedImport} from '../src/services/uidQueueHandoff.js';
import {createHttpExecutor} from '../src/services/socialHttpTransport.js';import {proxyEndpoint} from '../src/services/proxyEndpoint.js';import {boundedProxyRead} from '../src/services/crawlerQueueFlow.js';
const opaque='pfbidGenericOpaqueProfile123',url='https://www.facebook.com/'+opaque;
const html=x=>'<script type="application/json">'+JSON.stringify(x)+'</script>',snapshot=x=>({httpStatus:200,finalUrl:url,html:html(x)});
const data={item:{id:'22',type:'reply',parentId:'21',createdAt:'2026-10-27T01:00:00Z',author:{id:null,name:'Example',opaqueId:opaque}},source:{platform:'facebook',nativeId:'9',type:'group'},parent:{nativeId:'11',systemId:'9_11'},originalImportJobId:'original'};
test('explicit spreadsheet UID mappings resolve only their exact author URL and retain source provenance',async()=>{
 const item={...data.item,author:{...data.item.author,id:'123456',idEvidence:'operator_excel_uid_mapping',uidMapping:{sourceFileSha256:'a'.repeat(64),row:2,lookupUrl:url}}};
 const proof=operatorSuppliedUid(item);assert.equal(proof.id,'123456');assert.equal(proof.sourceRow,2);
 const calls=[];await enqueueUidResolvedImport({enqueue:async(...args)=>calls.push(args),data:{...data,item},proof,lookupJobId:'lookup'});assert.equal(calls[0][1].item.author.id,'123456');assert.equal(calls[0][1].item.author.uidMapping.sourceFileSha256,'a'.repeat(64));
 for(const change of [{lookupUrl:'https://www.facebook.com/unrelated'},{sourceFileSha256:'invalid'},{row:1}])assert.equal(operatorSuppliedUid({...item,author:{...item.author,uidMapping:{...item.author.uidMapping,...change}}}),null);
 assert.equal(operatorSuppliedUid({...item,author:{...item.author,idEvidence:'untrusted'}}),null);
});
test('profile URL is built from the opaque author, never from a parent or supplied UID table',()=>{assert.equal(uidLookupUrl(data.item),url);assert.equal(needsUidLookup(data,'FACEBOOK_COMMENT_AUTHOR_ID_UNVERIFIED'),true);assert.equal(needsUidLookup(data,'EXACT_PUBLICATION_DATE_REQUIRED'),false);});
test('profile parser reads numeric UID from target route or matching actor and rejects unrelated/viewer IDs',()=>{
 for(const id of ['123456789','987654321'])assert.equal(profileUidFromSnapshot(snapshot({initialRouteInfo:{route:{canonicalRouteName:'comet.fbweb.CometProfileLoggedOutRoute',rootView:{props:{userID:id}}}}}),url).id,id);
 assert.equal(profileUidFromSnapshot(snapshot({data:{user:{__typename:'User',id:'777',url}}}),url).id,'777');
 assert.equal(profileUidFromSnapshot(snapshot({viewer:{actor:{__typename:'User',id:'555',url:'https://www.facebook.com/555'}},profile_id:'888',CurrentUserInitialData:{USER_ID:'999'}}),url),null);
 assert.equal(profileUidFromSnapshot(snapshot({routeCache:{canonicalRouteName:'CometProfileRoute',canonicalUrl:'https://www.facebook.com/unrelated',rootView:{props:{userID:'456'}}}}),url),null);
 assert.equal(profileUidFromSnapshot(snapshot({canonicalRouteName:'CometErrorRoute',rootView:{props:{userID:'123'}}}),url),null);
 assert.throws(()=>profileUidFromSnapshot(snapshot({a:{__typename:'User',id:'1',url},b:{__typename:'User',id:'2',url}}),url),/UID_CONFLICT/);
});
test('profile app links require matching canonical evidence',()=>{const s={httpStatus:200,html:'<meta property="og:url" content="'+url+'"><meta property="al:android:url" content="fb://profile/123456">'};assert.equal(profileUidFromSnapshot(s,url).id,'123456');assert.equal(profileUidFromSnapshot({...s,html:s.html.replace(url,'https://www.facebook.com/unrelated')},url),null);});
test('native lookup requests the exact /pfbid link and resolves the live response',async()=>{let requested;const result=await findFacebookUid({request:async u=>{requested=u;return snapshot({initialRouteInfo:{route:{canonicalRouteName:'CometProfileRoute',rootView:{props:{userID:'123456'}}}}});}},data.item);assert.equal(requested,url);assert.equal(result.id,'123456');assert.equal(result.status,'resolved');});
test('failed import handoff keeps the failed ticket and Mongo record; enqueue failure leaves it untouched',async()=>{
 const events=[],row={_id:'original',data};const args={row,ticket:{getState:async()=>'failed',remove:async()=>events.push('remove')},jobs:{updateOne:async()=>events.push('linkLookup')},backups:{updateOne:async()=>events.push('backup')},enqueue:async(q,p,e,id)=>{events.push('enqueue');assert.equal(q,'find-uid');assert.deepEqual(p.parent,data.parent);assert.equal(p.originalImportJobId,row._id);}};
 assert.equal(await migrateFailedUidImport(args),true);assert.deepEqual(events,['backup','enqueue','linkLookup']);events.length=0;
 await assert.rejects(()=>migrateFailedUidImport({...args,enqueue:async()=>{throw Error('REDIS_DOWN');}}),/REDIS_DOWN/);assert.deepEqual(events,['backup']);
});
test('resolved UID goes back through normal ES5 validation with a distinct deterministic job ID',async()=>{const calls=[],enqueue=async(...x)=>calls.push(x);const a=await enqueueUidResolvedImport({enqueue,data,proof:{id:'123',evidence:'response.profile.userID'},lookupJobId:'lookup'}),b=await enqueueUidResolvedImport({enqueue,data,proof:{id:'123'},lookupJobId:'lookup'});assert.equal(a,b);assert.notEqual(a,data.originalImportJobId);assert.equal(calls[0][0],'es5-import');assert.equal(calls[0][1].item.author.id,'123');assert.equal(calls[0][1].item.parentId,'21');assert.equal(data.item.author.id,null);await assert.rejects(()=>enqueueUidResolvedImport({enqueue,data,proof:{id:opaque},lookupJobId:'lookup'}),/UID_PROOF_REQUIRED/);});
test('retry acquires another actual proxy endpoint and refuses a provider repeating the failed endpoint',async()=>{
 const a={server:'http://proxy-a:8080'},b={server:'http://proxy-b:8080'},context={},acquisitions=[];let work=0,release=0;
 const execute=createHttpExecutor({respectPlatformCooldown:false,getProxy:async t=>{acquisitions.push(t.excludeProxyEndpoint);return{...(acquisitions.length<3?a:b),release:async()=>release++};},makeSession:({onProxyLimit})=>({close(){},limit(){onProxyLimit({source:'proxy_connect',scope:'proxy',confirmed:true,httpStatus:429});}})}),target={platform:'facebook',operation:'resolve_source',proxyRetryContext:context};
 assert.equal((await execute(target,async session=>{work++;session.limit();return{status:'proxy_error',reason:'PROXY_CONNECT_RATE_LIMITED'};})).status,'proxy_error');
 const refused=await execute(target,async()=>{work++;return{status:'resolved'};});assert.equal(refused.reason,'PROXY_RETRY_ENDPOINT_UNAVAILABLE');assert.equal(refused.transport.proxyUsed,false);
 const result=await execute(target,async()=>{work++;return{status:'resolved'};});assert.equal(result.status,'resolved');assert.equal(work,2);assert.equal(release,3);assert.deepEqual(acquisitions,[undefined,proxyEndpoint(a),proxyEndpoint(a)]);
 assert.equal(proxyEndpoint({host:'proxy-a',port:8080,username:'other'}),proxyEndpoint(a));
});
test('a busy pool fails the UID job immediately without waiting or retrying',async()=>{
 let calls=0;const out=await boundedProxyRead({read:async()=>{calls++;return{good:false,result:{reason:'PROXY_POOL_BUSY',transport:{proxyUsed:false}}};},rotate:async()=>{throw Error('NO_ROTATE');},onRetry:async()=>{throw Error('NO_RETRY');}});
 assert.equal(out.failed,true);assert.equal(out.lastResult.reason,'PROXY_POOL_BUSY');assert.equal(calls,1);
});
test('a rejected profile HTTP request surfaces the limit without retrying internally',async()=>{let calls=0;await assert.rejects(()=>findFacebookUid({request:async()=>{calls++;return{httpStatus:429,finalUrl:url,html:''};}},data.item),e=>e.code==='FACEBOOK_RATE_LIMITED');assert.equal(calls,1);});

test('a failed import already handed to UID is retained without scheduling a second lookup',async()=>{
 const changed=await migrateFailedUidImport({row:{_id:'original',uidLookupJobId:'lookup',data},ticket:{getState:async()=>{throw Error('UNEXPECTED_RESCAN');}},enqueue:async()=>{throw Error('DUPLICATE_LOOKUP');}});
 assert.equal(changed,false);
});
test('opaque post authors use proof-backed UID lookup rather than inventing the inventory author',()=>{
 const item={author:{id:opaque}},postData={source:{platform:'facebook'},item};assert.equal(uidLookupUrl(item),'https://www.facebook.com/'+opaque);assert.equal(needsUidLookup(postData,'POST_AUTHOR_SOURCE_MISMATCH'),true);assert.equal(needsUidLookup({...postData,item:{author:{id:'123'}}},'POST_AUTHOR_SOURCE_MISMATCH'),false);
});
