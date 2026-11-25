import test from 'node:test';import assert from 'node:assert/strict';
import {facebookAuthorIdentity,numericFacebookProfileUrl,facebookAuthorRoute,parseFacebookAuthorRoutes} from '../src/services/facebookAuthorIdentity.js';
import {normalizeComment} from '../scripts/facebook_comments.js';import {serializeCrawlItem} from '../src/services/crawlerV8Es5.js';
const opaque='pfbid033wgMkZUyDkHw9nc92kapMsPzQoBp8c4pS74CNkhjHxmRMarpmEBtdigTvA6k6SB9l',uid='100027830022432';
test('opaque Actor ID is never emitted as authorId; numeric profile URL is exact evidence',()=>{
 const x=normalizeComment({legacy_fbid:'1138964528527706',author:{id:opaque,name:'Thông Trần',url:'https://www.facebook.com/profile.php?id='+uid},created_time:1792940000},{idPost:'1455538723334290',idGetComment:'1455538723334290'});assert.equal(x.authorId,uid);assert.equal(x.authorOpaqueId,opaque);
 const missing=facebookAuthorIdentity({id:opaque,url:'https://www.facebook.com/thong.tran'});assert.equal(missing.id,null);assert.equal(missing.opaqueId,opaque);
});
test('numeric IDs remain exact strings; unsafe integers and post/photo links do not become UIDs',()=>{
 assert.equal(facebookAuthorIdentity({id:uid}).id,uid);assert.equal(facebookAuthorIdentity({id:9007199254740992}).id,null);
 for(const url of ['https://evil.example/profile.php?id='+uid,'https://www.facebook.com/photo.php?fbid='+uid,'https://www.facebook.com/'+uid+'?comment_id=123'])assert.equal(numericFacebookProfileUrl(url),null);
});
test('profile routing resolves only the specifically requested profile, including redirects',()=>{
 const route='/'+opaque,r={exports:{canonicalRouteName:'comet.fbweb.CometProfileLoggedOutRoute',rootView:{props:{userID:uid}}}};
 const data={payload:{payloads:{[route]:{result:{type:'route_redirect',redirect_result:r}},'/unrelated':{result:{exports:{rootView:{props:{userID:'99'}}}}}}}};
 assert.equal(parseFacebookAuthorRoutes(data,[route]).get(route).id,uid);assert.equal(parseFacebookAuthorRoutes(data,[route]).size,1);
 assert.equal(parseFacebookAuthorRoutes({payload:{payloads:{[route]:{result:{exports:{canonicalRouteName:'CometSinglePostRoot',rootView:{props:{userID:'99'}}}}}}}},[route]).size,0);
 assert.equal(facebookAuthorRoute('https://www.facebook.com/'+opaque),route);assert.equal(facebookAuthorRoute('https://www.facebook.com/123?story_fbid=999'),null);
});
test('ES5 writer rejects opaque and missing Facebook comment authors before writing',()=>{
 const source={platform:'facebook',type:'page',nativeId:'1000944783433715',name:'Fixture'},parent={nativeId:'1455538723334290',systemId:'1000944783433715_1455538723334290',url:'https://www.facebook.com/1000944783433715_1455538723334290',createdAt:'2026-10-25T00:01:15Z'},item={id:'1138964528527706',postId:parent.nativeId,createdAt:'2026-10-25T14:52:53Z',author:{id:opaque}};
 assert.throws(()=>serializeCrawlItem(item,source,{parent}),/FACEBOOK_COMMENT_AUTHOR_ID_UNVERIFIED/);assert.throws(()=>serializeCrawlItem({...item,author:null},source,{parent}),/FACEBOOK_COMMENT_AUTHOR_ID_UNVERIFIED/);
 const d=serializeCrawlItem({...item,author:{id:uid}},source,{parent});assert.equal(d._id,'1455538723334290_1138964528527706');assert.equal(d._source.authorId,uid);
});
test('author route lookup uses fresh anonymous context and no captured request form',async()=>{
 const {createAnonymousFacebookGraphqlRequest}=await import('../src/services/facebookAnonymousGraphql.js');let calls=0;
 const session={async request(url,opts){calls++;if(!opts?.method)return{httpStatus:200,finalUrl:'https://www.facebook.com/source',html:'<script type="application/json">'+JSON.stringify({require:[['LSD',[],{token:'fresh-public-csrf'}],['CurrentUserInitialData',[],{USER_ID:'0'}]]})+'</script>'};
  assert.match(url,/bulk-route-definitions/);const form=new URLSearchParams(opts.body);assert.equal(form.get('__user'),'0');assert.equal(form.get('lsd'),'fresh-public-csrf');assert.equal(form.has('fb_dtsg'),false);assert.equal(opts.headers.cookie,undefined);
  return{httpStatus:200,finalUrl:url,html:'for (;;);'+JSON.stringify({payload:{payloads:{['/'+opaque]:{result:{exports:{canonicalRouteName:'comet.fbweb.CometProfileLoggedOutRoute',rootView:{props:{userID:uid}}}}}}}})};
 }};const request=createAnonymousFacebookGraphqlRequest(session,{bootstrapUrl:'https://www.facebook.com/source'});assert.equal((await request.resolveAuthorRoutes(['https://www.facebook.com/'+opaque])).get('/'+opaque).id,uid);assert.equal(calls,2);
});
test('maps the numeric User projection from the same comment response, without a lookup',async()=>{
 const {collectFacebookCommentAuthorIdentities,facebookCommentAuthorIdentity}=await import('../src/services/facebookAuthorIdentity.js');
 const cid='1138964528527706',relay=Buffer.from('comment:1455538723334290_'+cid).toString('base64');
 const node={legacy_fbid:cid,id:relay,author:{__typename:'User',id:opaque,url:'https://www.facebook.com/thong.tran'},comet_comment_author_name_and_badges_renderer:{comment:{id:relay,user:{__typename:'User',id:uid}}}};
 const root={node:{comments:{edges:[{node}]}}},map=collectFacebookCommentAuthorIdentities([{data:root}],root),identity=facebookCommentAuthorIdentity(node,map);
 assert.equal(identity.id,uid);assert.match(identity.evidence,/response.*comment.user.id/);
 const normalized=normalizeComment(node,{idPost:'1455538723334290',idGetComment:'1455538723334290',authorIdentities:map});assert.equal(normalized.authorId,uid);
});
test('maps an identity badge actor_id only when its comment_id matches this comment',async()=>{
 const {collectFacebookCommentAuthorIdentities,facebookCommentAuthorIdentity}=await import('../src/services/facebookAuthorIdentity.js');
 const cid='2175231943374057',badge=(comment_id,actor_id)=>({serialized:JSON.stringify({type:'top_fan',actor_id,target_id:999,surface:'comment',media_id:123,comment_id})});
 const node={legacy_fbid:cid,author:{__typename:'User',id:opaque,name:'Person'},comet_comment_author_name_and_badges_renderer:{comment:{legacy_fbid:cid,author:{id:opaque},discoverable_identity_badges_web:[badge(cid,uid),badge('999','123456')]}}};
 const root={node},ids=collectFacebookCommentAuthorIdentities([{data:root}],root);
 assert.equal(facebookCommentAuthorIdentity(node,ids).id,uid);
 assert.equal(normalizeComment(node,{idPost:'1588161299351035',idGetComment:'1588161299351035',authorIdentities:ids}).authorId,uid);
 const other={...node,comet_comment_author_name_and_badges_renderer:{comment:{legacy_fbid:cid,author:{id:opaque},discoverable_identity_badges_web:[badge('999',uid)]}}};
 assert.equal(facebookCommentAuthorIdentity(other).id,null);
});
test('group anonymous nickname uses the native post ID, never the composite source_post ID',()=>{
 const node={legacy_fbid:'456',author:{__typename:'GroupAnonAuthorProfile',id:'999',name:'RadiantSloth407'},created_time:1792940000};
 const c=normalizeComment(node,{idPost:'123',idGetComment:'123',sourceType:'group'});
 assert.equal(c.authorId,'123');assert.equal(c.author,'RadiantSloth407');assert.equal(c.authorIdEvidence,'response.group_anonymous_post_id');
 assert.notEqual(c.authorId,'77_123');
 assert.equal(normalizeComment(node,{idPost:'123',idGetComment:'123',sourceType:'page'}).authorId,'999');
});
test('a matching author profile link can recover a numeric actor elsewhere in the same response',async()=>{
 const {collectFacebookCommentAuthorIdentities,facebookCommentAuthorIdentity}=await import('../src/services/facebookAuthorIdentity.js');
 const url='https://www.facebook.com/people/Person/'+opaque+'/',node={legacy_fbid:'456',author:{__typename:'User',id:opaque,url}},root={comments:[node],profile:{__typename:'User',id:uid,url},unrelated:{__typename:'User',id:'999',url:'https://www.facebook.com/other'}};
 assert.equal(facebookCommentAuthorIdentity(node,collectFacebookCommentAuthorIdentities([{data:root}],root)).id,uid);
 const conflict={...root,another:{__typename:'User',id:'888',url}};
 assert.equal(facebookCommentAuthorIdentity(node,collectFacebookCommentAuthorIdentities([{data:conflict}],conflict)).id,null);
});
test('a numeric deferred author projection is preserved when a later projection has pfbid',async()=>{
 const {collectFacebookCommentAuthorIdentities,facebookCommentAuthorIdentity}=await import('../src/services/facebookAuthorIdentity.js');const {mergeChunks}=await import('../scripts/paginate_facebook_group_capture.js');
 const node={legacy_fbid:'1138964528527706',author:{id:uid}},chunks=[{data:{node:{comments:{edges:[{node}]}}}},{path:['node','comments','edges',0,'node','author'],data:{id:opaque}}],merged=mergeChunks(chunks);
 assert.equal(merged.node.comments.edges[0].node.author.id,opaque);
 assert.equal(facebookCommentAuthorIdentity(merged.node.comments.edges[0].node,collectFacebookCommentAuthorIdentities(chunks,merged)).id,uid);
});
test('mentions, parent owners, and another comment author are not the comment UID',async()=>{
 const {collectFacebookCommentAuthorIdentities,facebookCommentAuthorIdentity}=await import('../src/services/facebookAuthorIdentity.js');
 const node={legacy_fbid:'1138964528527706',author:{id:opaque},body:{ranges:[{entity:{id:uid}}]},feedback:{owning_profile:{id:uid}},comet_comment_author_name_and_badges_renderer:{comment:{legacy_fbid:'999',user:{id:uid}}}};
 const root={node};assert.equal(facebookCommentAuthorIdentity(node,collectFacebookCommentAuthorIdentities([{data:root}],root)).id,null);
});
test('conflicting numeric author projections remain unresolved instead of selecting any number',async()=>{
 const {collectFacebookCommentAuthorIdentities,facebookCommentAuthorIdentity}=await import('../src/services/facebookAuthorIdentity.js');const node={legacy_fbid:'1138964528527706',author:{id:opaque},user:{id:uid},comet_comment_author_name_and_badges_renderer:{comment:{legacy_fbid:'1138964528527706',author:{id:'100000000000001'}}}};
 const root={node};const r=facebookCommentAuthorIdentity(node,collectFacebookCommentAuthorIdentities([{data:root}],root));assert.equal(r.id,null);assert.equal(r.evidence,'response.author_identity_conflict');
});
import {facebookAuthorProfileKey,cachedFacebookCommentAuthor} from '../src/services/facebookAuthorIdentity.js';
test('a changing opaque author ID can use a unique numeric ID already observed on the same exact profile URL',()=>{
 const key=facebookAuthorProfileKey('https://www.facebook.com/Person.Name/?__tn__=test'),cache=new Map([[key,{id:uid,evidence:'verified_numeric_comment_response.profile_url'}]]);
 const r=cachedFacebookCommentAuthor({authorId:null,authorOpaqueId:'pfbidNewResponse',authorUrl:'https://www.facebook.com/person.name'},cache);assert.equal(r.id,uid);assert.equal(r.evidence,'verified_numeric_comment_response.profile_url');
});
test('URL cache evidence cannot override a conflicting actor fact or a direct numeric response',()=>{
 const url='https://www.facebook.com/person.name',cache=new Map([['opaque',{id:uid}],[facebookAuthorProfileKey(url),{id:'100000000000001'}]]);
 assert.equal(cachedFacebookCommentAuthor({authorId:null,authorOpaqueId:'opaque',authorUrl:url},cache).evidence,'cached_author_identity_conflict');
 assert.equal(cachedFacebookCommentAuthor({authorId:uid,authorUrl:url},cache),null);
 assert.equal(cachedFacebookCommentAuthor({authorId:null,authorUrl:url,authorIdEvidence:'response.author_identity_conflict'},cache),null);
});
test('generic login, content and off-platform URLs cannot be cached as an author profile',()=>{
 for(const url of ['https://www.facebook.com/login.php?next=profile','https://www.facebook.com/l.php?u=profile','https://www.facebook.com/watch','https://www.facebook.com/123?comment_id=9','https://evil.example/person'])assert.equal(facebookAuthorProfileKey(url),null);
 assert.notEqual(facebookAuthorProfileKey('https://www.facebook.com/pfbidAbCd'),facebookAuthorProfileKey('https://www.facebook.com/pfbidabcd'));
});
test('UID of the exact same verified native comment can be restored without a profile lookup or reusable profile fact',()=>{
 const time='2026-10-25T01:02:03.000Z',cache=new Map([['facebook-comment:123_456',{id:uid,publishedDate:time,evidence:'verified_es5_same_native_comment'}]]);
 assert.equal(cachedFacebookCommentAuthor({idPost:'123',_id:'456',time,authorOpaqueId:'new-opaque'},cache).id,uid);
 assert.equal(cachedFacebookCommentAuthor({idPost:'123',_id:'457',time,authorOpaqueId:'new-opaque'},cache),null);
 assert.equal(cachedFacebookCommentAuthor({idPost:'123',_id:'456',time:'2026-10-24T01:02:03Z'},cache),null);
});
test('profile route rejects conflicting numeric root props and accepts only valid opaque profile query identifiers',()=>{
 const route='/profile.php?id=pfbidAb123',data={payload:{payloads:{[route]:{result:{exports:{canonicalRouteName:'CometProfileRoot',rootView:{props:{userID:uid,profileID:'999'}}}}}}}};
 assert.equal(parseFacebookAuthorRoutes(data,[route]).size,0);
 assert.equal(facebookAuthorRoute('https://www.facebook.com'+route),route);
 assert.equal(facebookAuthorRoute('https://www.facebook.com/profile.php?id=someone'),null);
 assert.equal(facebookAuthorRoute('https://www.facebook.com/profile.php?id=pfbidAb123&comment_id=1'),null);
});
test('public profile HTML binds native identity to the matching profile, and rejects unrelated authors or conflicting root identities',async()=>{
 const {publicFacebookProfileIdentity}=await import('../src/services/facebookPublicAuthorIdentity.js');const url='https://www.facebook.com/'+opaque,base={require:[['LSD',[],{token:'fresh'}],['CurrentUserInitialData',[],{USER_ID:'0'}]]};
 const snap=extra=>({httpStatus:200,finalUrl:url,html:'<script type="application/json">'+JSON.stringify({...base,...extra})+'</script>'});
 assert.equal(publicFacebookProfileIdentity(snap({view:{rootView:{props:{userID:uid}}}}),url).id,uid);
 assert.equal(publicFacebookProfileIdentity(snap({entity:{__typename:'User',id:uid,url}}),url).id,uid);
 assert.equal(publicFacebookProfileIdentity(snap({entity:{__typename:'User',id:uid,url:'https://www.facebook.com/other'}}),url),null);
 assert.equal(publicFacebookProfileIdentity(snap({view:{rootView:{props:{userID:uid,profileID:'123'}}}}),url),null);
 assert.notEqual(facebookAuthorProfileKey('https://www.facebook.com/profile.php?id=pfbidAbC'),facebookAuthorProfileKey('https://www.facebook.com/profile.php?id=pfbidabc'));
});
test('public author URL handles legacy people profiles and response actor IDs without accepting arbitrary redirects',async()=>{
 const {facebookPublicAuthorProfileUrl}=await import('../src/services/facebookAuthorIdentity.js');
 assert.equal(facebookPublicAuthorProfileUrl({profileUrl:'https://www.facebook.com/people/Person/'+opaque+'/?tracking=1'}),'https://www.facebook.com/people/Person/'+opaque);
 assert.equal(facebookPublicAuthorProfileUrl({opaqueId:opaque}),'https://www.facebook.com/profile.php?id='+opaque);
 assert.equal(facebookPublicAuthorProfileUrl({profileUrl:'//evil.test/user'}),null);
 assert.equal(facebookPublicAuthorProfileUrl({profileUrl:'https://evil.test/user'}),null);
 assert.equal(facebookPublicAuthorProfileUrl({opaqueId:'not-an-author-id'}),null);
 const cache=new Map([[facebookAuthorProfileKey('https://www.facebook.com/profile.php?id='+opaque),{id:uid,evidence:'public_profile.route_and_html_agree'}]]);
 assert.equal(cachedFacebookCommentAuthor({authorOpaqueId:opaque},cache).id,uid);
});
test('viewer zero can never be resolved as a public profile author UID',async()=>{
 const {publicFacebookProfileIdentity}=await import('../src/services/facebookPublicAuthorIdentity.js');const url='https://www.facebook.com/person',root={require:[['LSD',[],{token:'fresh'}]],view:{rootView:{props:{userID:'0'}}}};
 assert.equal(publicFacebookProfileIdentity({httpStatus:200,finalUrl:url,html:'<script type="application/json">'+JSON.stringify(root)+'</script>'},url),null);
 const route='/person';assert.equal(parseFacebookAuthorRoutes({payload:{payloads:{[route]:{result:{exports:{canonicalRouteName:'CometProfile',rootView:{props:{userID:'0'}}}}}}}},[route]).size,0);
});
test('opaque public profile alias is retried only after an unresolved public response, never an auth or checkpoint response',async()=>{
 const {resolvePublicFacebookAuthor}=await import('../src/services/facebookPublicAuthorIdentity.js');let calls=[];
 const snapshot=(url,extra={})=>({httpStatus:200,finalUrl:url,html:'<script type="application/json">'+JSON.stringify({require:[['LSD',[],{token:'fresh'}]],...extra})+'</script>'});
 const session={async request(url,opts){calls.push(url);if(opts?.method){const route=new URLSearchParams(opts.body).get('route_urls[0]');return{httpStatus:200,finalUrl:url,html:JSON.stringify({payload:{payloads:{[route]:{error:true}}}})};}return snapshot(url,url.endsWith('/'+opaque)?{view:{rootView:{props:{userID:uid}}}}:{});}};
 const r=await resolvePublicFacebookAuthor(session,'https://www.facebook.com/profile.php?id='+opaque);assert.equal(r.id,uid);assert.equal(r.independentHtmlVerified,true);assert.equal(calls.filter(x=>x.endsWith('/'+opaque)).length,1);
 let blockedCalls=0;await assert.rejects(resolvePublicFacebookAuthor({request:async()=>{blockedCalls++;return{httpStatus:200,finalUrl:'https://www.facebook.com/login/',html:''};}},'https://www.facebook.com/profile.php?id='+opaque));assert.equal(blockedCalls,1);
});

test('raw numeric badge comment IDs above 2^53 retain every digit and match the exact comment',async()=>{
 const {facebookCommentAuthorIdentity,parseFacebookIdentityPayload}=await import('../src/services/facebookAuthorIdentity.js');
 const cid='39422409474041163',serialized='{"actor_id":100089879007973,"comment_id":39422409474041163,"target_id":100090865984514,"surface":"comment"}';
 assert.notEqual(String(JSON.parse(serialized).comment_id),cid);assert.equal(parseFacebookIdentityPayload(serialized).comment_id,cid);
 const node={legacy_fbid:cid,author:{id:opaque},comet_comment_author_name_and_badges_renderer:{comment:{legacy_fbid:cid,discoverable_identity_badges_web:[{serialized}]}}};assert.equal(facebookCommentAuthorIdentity(node).id,'100089879007973');
 const other={...node,legacy_fbid:'39422409474041164'};assert.equal(facebookCommentAuthorIdentity(other).id,null);
});
test('actor badge fallback searches alternative renderer containers without reading parent or mention identities',async()=>{
 const {facebookCommentAuthorIdentity}=await import('../src/services/facebookAuthorIdentity.js');const cid='39422409474041163',badge={serialized:'{"actor_id":"100089879007973","comment_id":39422409474041163,"surface":"comment"}'};
 assert.equal(facebookCommentAuthorIdentity({legacy_fbid:cid,author:{id:opaque},comment_upper_badge_renderer:{comment:{identity_badges_web:[badge]}}}).id,'100089879007973');
 assert.equal(facebookCommentAuthorIdentity({legacy_fbid:cid,author:{id:opaque},parent_post_story:{identity_badges_web:[badge]}}).id,null);
});
