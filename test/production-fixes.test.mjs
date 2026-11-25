import {test} from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';
import {instagramProfileIdentity} from '../src/services/instagramIdentity.js';
import {normalizeContentInput,extractContentSnapshot} from '../src/services/socialContent.js';
import {createSocialInfoReaders} from '../src/services/socialInfo.js';
import {facebookAnonymousContext,createAnonymousFacebookGraphqlRequest} from '../src/services/facebookAnonymousGraphql.js';
import {createEs5ReferenceLookup} from '../src/services/socialSystemReference.js';
import {createProxiedSession} from '../src/services/socialHttpTransport.js';
const html=x=>'<script type="application/json">'+JSON.stringify(x)+'</script>';
const profile={pk:'6920202806',id:'17841406804205025',username:'shopmichaelangelos',full_name:'Michaelangelos',polaris_ordered_timeline_connection:{edges:[{node:{pk:'123',code:'CODE',user:{id:'17841406804205025',username:'shopmichaelangelos'},caption:{text:'A public post'}}}],page_info:{has_next_page:false}}};
test('Instagram canonical pk survives nested scoped graph IDs in the source and author',()=>{
 const roots=[{data:{xig_user_by_username:profile}}],i=instagramProfileIdentity(roots,'shopmichaelangelos');assert.equal(i.id,'6920202806');assert.equal(i.webScopedId,'17841406804205025');
 const t=normalizeContentInput('source',{url:'https://www.instagram.com/shopmichaelangelos/'}),r=extractContentSnapshot(t,{httpStatus:200,finalUrl:t.url,html:html(roots[0])});assert.equal(r.source.id,'6920202806');assert.equal(r.items[0].author.id,'6920202806');assert.equal(r.items[0].author.webScopedId,'17841406804205025');assert.equal(r.items[0].id,'123');
});
test('Instagram source resolver returns canonical pk and does not overwrite it with child id',async()=>{
 const readers=createSocialInfoReaders({getProxy:async()=>({server:'http://proxy.test:8888'}),makeSession:()=>({requests:1,request:async()=>({httpStatus:200,finalUrl:'https://www.instagram.com/shopmichaelangelos/',html:html({data:{xig_user_by_username:profile}})}),close(){}})});
 const r=await readers.sourceInfo({platform:'instagram',url:'https://www.instagram.com/shopmichaelangelos/',username:'shopmichaelangelos'});assert.equal(r.id,'6920202806');assert.equal(r.idVerified,true);
});
test('Instagram conflicting canonical pks fail closed; a graph id alone is never called canonical',()=>{
 assert.equal(instagramProfileIdentity([{username:'a',id:'178414001'}],'a').verified,false);
 assert.equal(instagramProfileIdentity([{username:'a',pk:'1'},{username:'a',pk:'2'}],'a').reason,'INSTAGRAM_PROFILE_ID_CONFLICT');
});
const boot={httpStatus:200,finalUrl:'https://www.facebook.com/page/',html:html({require:[['CurrentUserInitialData',[],{USER_ID:'0'}],['LSD',[],{token:'fresh-anonymous-lsd'}],['SiteData',[],{client_revision:999,__spin_r:999,__spin_b:'trunk',__spin_t:123,hsi:'456'}]]})};
test('Facebook anonymous context is live, refuses logged-in actors and respects access errors',()=>{
 const c=facebookAnonymousContext(boot);assert.equal(c.dynamic.lsd,'fresh-anonymous-lsd');assert.equal(c.dynamic.__user,'0');assert.equal(c.dynamic.__rev,'999');
 assert.throws(()=>facebookAnonymousContext({...boot,httpStatus:429}),e=>e.code==='FACEBOOK_RATE_LIMITED');
 assert.throws(()=>facebookAnonymousContext({...boot,html:boot.html.replace('"USER_ID":"0"','"USER_ID":"123"')}),e=>e.code==='ANONYMOUS_CONTEXT_REQUIRED');
 assert.throws(()=>facebookAnonymousContext({...boot,html:'<html></html>'}),e=>e.code==='ANONYMOUS_BOOTSTRAP_UNAVAILABLE');
});
test('Facebook bootstrap is shared once on the same session, strips auth and replaces stale LSD',async()=>{
 const calls=[];const session={request:async(url,opts)=>{calls.push({url,opts});return url.includes('/api/graphql/')?{httpStatus:200,html:'{"data":{"node":{}}}',finalUrl:url}:boot;}};
 const request=createAnonymousFacebookGraphqlRequest(session,{bootstrapUrl:'https://www.facebook.com/page/'});
 const form={doc_id:'123',variables:'{}',lsd:'stale',fb_dtsg:'never-forward',access_token:'never-forward',__user:'123',av:'123'};
 for(let i=0;i<2;i++)await request(form,{'x-fb-lsd':'stale',cookie:'never-forward',authorization:'never-forward','user-agent':'test-agent'});
 assert.equal(calls.length,3);assert.equal(calls[0].opts.headers['user-agent'],'Mozilla/5.0');
 for(const c of calls.slice(1)){const body=new URLSearchParams(c.opts.body);assert.equal(body.get('lsd'),'fresh-anonymous-lsd');assert.equal(body.get('fb_dtsg'),null);assert.equal(body.get('access_token'),null);assert.equal(body.get('__user'),'0');assert.equal(c.opts.headers.cookie,undefined);assert.equal(c.opts.headers.authorization,undefined);assert.equal(c.opts.headers['x-fb-lsd'],'fresh-anonymous-lsd');}
});
test('Facebook HTTP 200 envelope error cannot become FEED_UNAVAILABLE or empty success',async()=>{
 const request=createAnonymousFacebookGraphqlRequest({request:async()=>({httpStatus:200,html:'for (;;);{"__ar":1,"error":1357054,"errorSummary":"Request rejected"}',finalUrl:'https://www.facebook.com/api/graphql/'})},{bootstrap:false});
 await assert.rejects(()=>request({},{}),e=>e.code==='FACEBOOK_REQUEST_REJECTED');
 const auth=createAnonymousFacebookGraphqlRequest({request:async()=>({httpStatus:200,html:'{"error":1,"errorSummary":"Login required"}',finalUrl:'https://www.facebook.com/api/graphql/'})},{bootstrap:false});await assert.rejects(()=>auth({},{}),e=>e.code==='AUTH_REQUIRED');
});
test('ES5 known typed IDs use direct read-only GET, coalesce and cache successes without hiding failures',async()=>{
 let gets=0,searches=0,clock=0;const hit={_id:'9_123',_type:'snsTopic',_source:{url:'https://www.instagram.com/p/CODE/',siteId:'9'}};
 const lookup=createEs5ReferenceLookup({client:{get:async()=>{gets++;return hit;},search:async()=>{searches++;throw Error('must not search');}},now:()=>clock,cacheTtlMs:100});
 const q={id:'9_123',platform:'instagram',type:'snsTopic',index:'master202643'};const [a,b]=await Promise.all([lookup(q),lookup(q)]);assert.equal(gets,1);assert.equal(searches,0);a.id='mutated';assert.equal(b.id,'123');assert.equal((await lookup(q)).id,'123');clock=101;await lookup(q);assert.equal(gets,2);
 const missing=createEs5ReferenceLookup({client:{get:async()=>{throw {status:404};}}});await assert.rejects(()=>missing(q),e=>e.status===404);
});
function wire(responses,calls){return(url,opts,cb)=>{const req=new EventEmitter();req.write=()=>{};req.destroy=e=>queueMicrotask(()=>req.emit('error',e));req.end=()=>queueMicrotask(()=>{calls.push(opts);const item=responses.shift();if(item.error){req.emit('error',item.error);return;}const res=new PassThrough();res.statusCode=item.status||200;res.headers={};cb(res);res.end(item.body||'{}');});return req;};}
test('GET and POST network errors return to the job loop without a same-proxy retry',async()=>{
 const proxy={server:'http://proxy.test:8888'},calls=[];const s=createProxiedSession({proxy,platform:'youtube',requestImpl:wire([{error:Object.assign(Error('socket hang up'),{code:'ECONNRESET'})}],calls)});await assert.rejects(()=>s.request('https://www.youtube.com/'));assert.equal(calls.length,1);assert.equal(s.networkRetries,0);s.close();
 const postCalls=[],post=createProxiedSession({proxy,platform:'youtube',requestImpl:wire([{error:Object.assign(Error('reset'),{code:'ECONNRESET'})}],postCalls)});await assert.rejects(()=>post.request('https://www.youtube.com/youtubei/v1/next',{method:'POST',body:'{}'}));assert.equal(postCalls.length,1);post.close();
 const rateCalls=[],rate=createProxiedSession({proxy,platform:'youtube',requestImpl:wire([{status:429}],rateCalls)});assert.equal((await rate.request('https://www.youtube.com/')).httpStatus,429);assert.equal(rateCalls.length,1);rate.close();
});

test('Facebook opaque pfbid aliases require canonical route AND matching exact SinglePost preloader',async()=>{
 const fs=await import('node:fs/promises');const {analyzeFacebookPostHtml,normalizeFacebookPostInput}=await import('../src/services/facebookShare.js');
 const fixture=JSON.parse(await fs.readFile(new URL('fixtures/facebook-share/public-share.json',import.meta.url)));
 const story=fixture.result.data.node_v2;const original=story.permalink_url||story.comet_sections.content.story.wwwURL;
 const request=normalizeFacebookPostInput(original);const canonical='pfbidCanonicalAlias123';const url=`https://www.facebook.com/permalink.php?story_fbid=${canonical}&id=${request.ownerId}`;
 story.permalink_url=url;if(story.comet_sections?.content?.story)story.comet_sections.content.story.wwwURL=url;
 const relay={require:[['RelayPrefetchedStreamCache','next',[],[fixture.query,{__bbox:{result:fixture.result}}]]]};
 const binding={initialRouteInfo:{route:{params:{id:request.ownerId,story_fbid:canonical}}},expectedPreloaders:[{preloaderID:fixture.query,variables:{storyID:story.id}}]};
 assert.equal(analyzeFacebookPostHtml(html(relay),request).isShare,null);
 assert.equal(analyzeFacebookPostHtml(html(relay)+html(binding),request).isShare,true);
 binding.expectedPreloaders[0].variables.storyID='unrelated';assert.equal(analyzeFacebookPostHtml(html(relay)+html(binding),request).isShare,null);
});
test('Facebook numeric shortcut fallback remains owner/post bound and never retries auth gates',async()=>{
 const fs=await import('node:fs/promises');const {checkFacebookPostShare}=await import('../src/services/facebookShare.js');const fixture=JSON.parse(await fs.readFile(new URL('fixtures/facebook-share/public-share.json',import.meta.url)));
 const relay=html({require:[['RelayPrefetchedStreamCache','next',[],[fixture.query,{__bbox:{result:fixture.result}}]]]});
 const calls=[];const r=await checkFacebookPostShare('61588342686925_122131613781278089',{fetchPage:async url=>{calls.push(url);return{status:200,body:calls.length===1?'<html>Profile</html>':relay};}});
 assert.equal(r.isShare,true);assert.match(calls[1],/permalink.php\?story_fbid=122131613781278089&id=61588342686925/);
 let gated=0;await checkFacebookPostShare('61588342686925_122131613781278089',{fetchPage:async()=>{gated++;return{status:403,body:''};}});assert.equal(gated,1);
});
test('ES5 GET not found falls back to exact search for custom-routed legacy documents',async()=>{
 let searches=0;const lookup=createEs5ReferenceLookup({client:{get:async()=>({found:false}),search:async q=>{searches++;assert.equal(q.index,'master202643');assert.deepEqual(q.body.query.bool.filter.at(-1),{term:{_id:'123_456'}});return{hits:{hits:[{_id:'123_456',_type:'fbPageComment',_source:{url:'https://www.facebook.com/9/posts/123?comment_id=456'}}]},_shards:{failed:0}};}}});
 assert.equal((await lookup({index:'master202643',type:'fbPageComment',platform:'facebook',kind:'comment',id:'123_456'})).id,'456');assert.equal(searches,1);
});
test('platform cooldown survives restart and merges deadlines instead of clearing them',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const {createPlatformCooldownStore}=await import('../src/services/socialCooldown.js');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'crawler-cooldown-')),file=path.join(dir,'state.json');let clock=1000;
 try{const a=createPlatformCooldownStore({file,now:()=>clock});a.defer('facebook',900000);const b=createPlatformCooldownStore({file,now:()=>clock});assert.equal(b.wait('facebook'),900000);b.defer('threads',5000);assert.equal(a.wait('threads'),5000);clock+=6000;assert.equal(a.wait('threads'),0);assert.equal(b.wait('facebook'),894000);}finally{await fs.rm(dir,{recursive:true,force:true});}
});


test('Facebook GraphQL supplies observed wire fetch headers when the capture omits automatic headers',async()=>{
 const {createAnonymousFacebookGraphqlRequest}=await import('../src/services/facebookAnonymousGraphql.js');let sent;
 const request=createAnonymousFacebookGraphqlRequest({request:async(url,options)=>{sent=options;return{httpStatus:200,html:'{"data":{}}',finalUrl:url};}},{bootstrap:false});
 await request({__user:'0',av:'0',variables:'{}'},{cookie:'must-drop',authorization:'must-drop'});
 assert.equal(sent.headers.origin,'https://www.facebook.com');assert.equal(sent.headers.accept,'*/*');assert.equal(sent.headers['sec-fetch-site'],'same-origin');assert.equal(sent.headers['sec-fetch-mode'],'cors');assert.equal(sent.headers['sec-fetch-dest'],'empty');assert.equal(sent.headers.cookie,undefined);assert.equal(sent.headers.authorization,undefined);
});
