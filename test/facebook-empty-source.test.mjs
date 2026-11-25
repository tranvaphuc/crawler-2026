import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {facebookEmptySourceProof,facebookSourceBootstrapUrl} from '../src/services/facebookEmptySource.js';
import {facebookAnonymousContext} from '../src/services/facebookAnonymousGraphql.js';
import {createFacebookContentHttpReader} from '../src/services/facebookContentHttp.js';
import {boundedProxyRead} from '../src/services/crawlerQueueFlow.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/facebook-empty-source-215664340449620.json',import.meta.url))),target={operation:'source',platform:'facebook',sourceType:'page',id:'215664340449620',profileId:'100075962508723',url:'https://www.facebook.com/215664340449620',limit:100,order:'latest'};
const snapshot=(root=fixture)=>({html:`<input name="lsd" value="anonymous"><script type="application/json">${JSON.stringify(root)}</script>`,httpStatus:200,finalUrl:'https://www.facebook.com/people/TNEX/100075962508723/'});
const clone=()=>structuredClone(fixture),user=root=>root.require[0][3][1].__bbox.result.data.user,final=root=>root.require[1][3][1].__bbox;
test('actual empty TNEX payload proves exact page/profile and merged deferred pagination',()=>{const proof=facebookEmptySourceProof(snapshot(),target);assert.equal(proof.sourceId,target.id);assert.equal(proof.profileId,target.profileId);assert.equal(proof.hasMore,false);assert.throws(()=>facebookAnonymousContext(snapshot(),{sourceTarget:target}),e=>e.code==='PUBLIC_ITEMS_NOT_RETURNED'&&e.context.emptySourceProof.sourceId===target.id);});
test('empty sidebar tiles or UI text never prove an empty source',()=>{for(const root of [{data:{user:{id:target.profileId,profile_tile_sections:{edges:[],page_info:{has_next_page:false}}}}},{message:'No posts'},{message:'Không có bài viết'}])assert.equal(facebookEmptySourceProof(snapshot(root),target),null);});
test('nonempty posts, pinned posts, continuing feed, missing pagination and unfinished streams are not skipped',()=>{
 for(const modify of [r=>user(r).timeline_list_feed_units.edges.push({node:{post_id:'123'}}),r=>user(r).profile_pinned_post={post_id:'123'},r=>final(r).result.data.page_info.has_next_page=true,r=>delete final(r).result.data.page_info,r=>final(r).complete=false]){const root=clone();modify(root);assert.equal(facebookEmptySourceProof(snapshot(root),target),null);}
});
test('foreign profile/delegate IDs and comments cannot be classified as empty source',()=>{
 for(const modify of [r=>user(r).id='other',r=>user(r).delegate_page.id='other']){const root=clone();modify(root);assert.equal(facebookEmptySourceProof(snapshot(root),target),null);}
 assert.equal(facebookEmptySourceProof(snapshot(),{...target,operation:'comments'}),null);assert.equal(facebookEmptySourceProof(snapshot(),{...target,sourceType:'group'}),null);
});
test('timeline/identity errors or unscoped errors are not mistaken for empty, optional ad field failures are allowed',()=>{
 for(const path of [undefined,['user'],['user','id'],['user','timeline_list_feed_units','edges']]){const root=clone();root.require[0][3][1].__bbox.result.errors=[{message:'failure',...(path?{path}:{})}];assert.equal(facebookEmptySourceProof(snapshot(root),target),null);}
 assert.ok(facebookEmptySourceProof(snapshot(),target));
});
test('login, HTTP failures, authenticated context and unrelated host never become empty source',()=>{
 for(const override of [{httpStatus:429},{httpStatus:503},{finalUrl:'https://www.facebook.com/login/'},{finalUrl:'https://other.test/'}])assert.equal(facebookEmptySourceProof({...snapshot(),...override},target),null);
 const root=clone();root.require.push(['CurrentUserInitialData',[],{USER_ID:'999'}]);assert.equal(facebookEmptySourceProof(snapshot(root),target),null);assert.throws(()=>facebookAnonymousContext(snapshot(root),{sourceTarget:target}),e=>e.code==='ANONYMOUS_CONTEXT_REQUIRED');
});
test('user sources can prove empty with their own identity without inventing a delegate page',()=>{const root=clone();delete user(root).delegate_page;assert.ok(facebookEmptySourceProof(snapshot(root),{...target,id:target.profileId,sourceType:'user'}));});
test('only page source bootstrap uses the verified profile alias; comment and group URLs stay canonical',()=>{assert.equal(facebookSourceBootstrapUrl(target),'https://www.facebook.com/100075962508723');for(const override of [{operation:'comments'},{sourceType:'group'},{profileId:null}])assert.equal(facebookSourceBootstrapUrl({...target,...override}),target.url);});
test('empty source stops before GraphQL, releases its lease, and policy completes without proxy rotation',async()=>{
 const calls=[];let released=0,rotated=0,audited=0;
 const read=createFacebookContentHttpReader({getProxy:async()=>({server:'http://test.proxy:8080',release:async()=>released++}),makeSession:()=>({requests:0,async request(url){this.requests++;calls.push(url);assert.notEqual(url,'https://www.facebook.com/api/graphql/');return snapshot();},close(){}}),createPostFetcher:({request})=>async()=>{await request({fb_api_req_friendly_name:'ProfileCometTimelineFeedRefetchQuery'},{});assert.fail('empty bootstrap must stop before feed POST');}});
 const r=await read(target);assert.equal(r.status,'unavailable');assert.equal(r.reason,'PUBLIC_ITEMS_NOT_RETURNED');assert.equal(r.identityVerified,true);assert.equal(r.pagination.hasMore,false);assert.equal(r.count,0);assert.equal(calls.length,1);assert.equal(released,1);assert.equal(calls[0],'https://www.facebook.com/100075962508723');
 const outcome=await boundedProxyRead({read:async()=>({good:false,result:r}),rotate:async()=>rotated++,onFailure:async()=>audited++});assert.equal(outcome.done,true);assert.equal(rotated,0);assert.equal(audited,1);
});
test('real post fetcher context wrapping retains empty proof and never sends a feed POST',async t=>{
 const{mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{createFacebookPostFetcher}=await import('../scripts/facebook_posts.js');
 const dir=await mkdtemp(join(tmpdir(),'empty-feed-har-'));t.after(()=>rm(dir,{recursive:true,force:true}));const har=join(dir,'page.har');await writeFile(har,JSON.stringify({log:{entries:[{request:{url:'https://www.facebook.com/api/graphql/',headers:[],postData:{text:new URLSearchParams({fb_api_req_friendly_name:'ProfileCometTimelineFeedRefetchQuery',variables:JSON.stringify({id:target.profileId,count:100,cursor:null})}).toString()}}}]}}));
 let requests=0;const reader=createFacebookContentHttpReader({getProxy:async()=>({server:'http://test.proxy:8080'}),makeSession:()=>({requests:0,async request(url){requests++;assert.notEqual(url,'https://www.facebook.com/api/graphql/');return snapshot();},close(){}}),createPostFetcher:options=>createFacebookPostFetcher({...options,harPaths:{page:har}})});
 const result=await reader(target);assert.equal(result.reason,'PUBLIC_ITEMS_NOT_RETURNED');assert.equal(result.status,'unavailable');assert.ok(result.emptySourceProof);assert.equal(result.pagination.hasMore,false);assert.equal(requests,1);
});
