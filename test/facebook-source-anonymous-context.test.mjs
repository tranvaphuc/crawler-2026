import test from 'node:test';
import assert from 'node:assert/strict';
import {facebookAnonymousContext,createAnonymousFacebookGraphqlRequest} from '../src/services/facebookAnonymousGraphql.js';

const target='https://www.facebook.com/groups/123/';
const login=(actor='0',token='owned-fresh-context')=>({httpStatus:200,finalUrl:'https://www.facebook.com/login/',html:'<script type="application/json">'+JSON.stringify({require:[['CurrentUserInitialData',[],{USER_ID:actor}],['LSD',[],{token}],['SiteData',[],{client_revision:55}]]})+'</script>'});
function fixture({first=login('0','owned-target-context'),root=login(),feed='{"data":{"node":{"id":"123"}}}',enabled=true,missingEnabled=false}={}) {
 const calls=[];
 const session={async request(url,options={}){calls.push({url,options});if(url===target)return first;if(url==='https://www.facebook.com/')return root;return{httpStatus:200,finalUrl:url,html:feed};}};
 return {calls,request:createAnonymousFacebookGraphqlRequest(session,{bootstrapUrl:target,sourceContextFallback:enabled,missingContextFallback:missingEnabled})};
}
test('source redirect obtains fresh root context once, retains target referer and does not replay captured auth',async()=>{
 const {calls,request}=fixture();
 for(let i=0;i<2;i++)await request({variables:JSON.stringify({id:'123',cursor:i?'owned-cursor':null}),lsd:'owned-stale',fb_dtsg:'owned-never',access_token:'owned-never',__user:'99',av:'99'},{cookie:'owned-never',authorization:'owned-never'});
 assert.deepEqual(calls.map(x=>x.url),[target,'https://www.facebook.com/','https://www.facebook.com/api/graphql/','https://www.facebook.com/api/graphql/']);
 for(const {options}of calls.slice(2)){const f=new URLSearchParams(options.body);assert.equal(f.get('lsd'),'owned-fresh-context');assert.equal(f.get('__rev'),'55');assert.equal(f.get('__user'),'0');assert.equal(f.get('av'),'0');assert.equal(f.get('fb_dtsg'),null);assert.equal(f.get('access_token'),null);assert.equal(options.headers.referer,target);assert.equal(options.headers['x-fb-lsd'],'owned-fresh-context');assert.equal(options.headers.cookie,undefined);assert.equal(options.headers.authorization,undefined);}
 assert.equal(JSON.parse(new URLSearchParams(calls.at(-1).options.body).get('variables')).cursor,'owned-cursor');
});
test('ordinary source and comment bootstrap still rejects a login redirect unless source fallback is enabled',async()=>{
 assert.throws(()=>facebookAnonymousContext(login()),e=>e.code==='AUTH_REQUIRED');
 const {calls,request}=fixture({enabled:false});await assert.rejects(()=>request({},{}),e=>e.code==='AUTH_REQUIRED');assert.equal(calls.length,1);
});
test('context-only login requires an explicit anonymous actor and a fresh token',()=>{
 assert.equal(facebookAnonymousContext(login(),{contextOnly:true}).dynamic.__user,'0');
 assert.throws(()=>facebookAnonymousContext(login('99'),{contextOnly:true}),e=>e.code==='ANONYMOUS_CONTEXT_REQUIRED');
 assert.throws(()=>facebookAnonymousContext({...login(),html:'<input name="lsd" value="owned-token">'},{contextOnly:true}),e=>e.code==='ANONYMOUS_CONTEXT_UNVERIFIED');
 assert.throws(()=>facebookAnonymousContext({...login(),html:'<script type="application/json">{"require":[["CurrentUserInitialData",[],{"USER_ID":"0"}]]}</script>'},{contextOnly:true}),e=>e.code==='ANONYMOUS_BOOTSTRAP_UNAVAILABLE');
});
test('source restrictions, HTTP authentication failures and checkpoints do not trigger context fallback',async()=>{
 for(const first of [{...login(),httpStatus:401},{...login(),finalUrl:'https://www.facebook.com/checkpoint/'},{...login(),html:login().html+'<h2>You must be 18 years old. Log in.</h2>'}]){const {calls,request}=fixture({first});await assert.rejects(()=>request({},{}));assert.equal(calls.length,1);}
});
test('generic context bootstrap cannot accept foreign login hosts, checkpoints, logged-in actors or rate limits',async()=>{
 for(const root of [{...login(),finalUrl:'https://other.test/login/'},{...login(),finalUrl:'https://www.facebook.com/checkpoint/'},login('99'),{...login(),httpStatus:429}]){const {calls,request}=fixture({root});await assert.rejects(()=>request({},{}));assert.equal(calls.length,2);}
});
test('native GraphQL access errors remain failures after obtaining anonymous context',async()=>{
 const {calls,request}=fixture({feed:'{"error":1,"errorSummary":"Login required"}'});
 await assert.rejects(()=>request({},{}),e=>e.code==='AUTH_REQUIRED');assert.equal(calls.length,3);
});
test('a public target bootstrap keeps its own context without an extra root request',async()=>{
 const {calls,request}=fixture({first:{...login('0','owned-public-target'),finalUrl:target}});
 await request({},{});assert.equal(calls.length,2);assert.equal(new URLSearchParams(calls[1].options.body).get('lsd'),'owned-public-target');
});

const missingContext={httpStatus:200,finalUrl:target,html:'<script type="application/json">{"require":[["CurrentUserInitialData",[],{"USER_ID":"0"}]]}</script>'};
test('a tokenless public source bootstrap refreshes only anonymous context once without changing source or cursor',async()=>{
 const {calls,request}=fixture({first:missingContext});
 for(const cursor of ['first','next'])await request({variables:JSON.stringify({id:'123',cursor})},{});
 assert.deepEqual(calls.map(x=>x.url),[target,'https://www.facebook.com/','https://www.facebook.com/api/graphql/','https://www.facebook.com/api/graphql/']);
 const form=new URLSearchParams(calls.at(-1).options.body);assert.equal(form.get('lsd'),'owned-fresh-context');assert.deepEqual(JSON.parse(form.get('variables')),{id:'123',cursor:'next'});
});
test('tokenless comments, confirmed restrictions and failed replacement context never reach a native query',async()=>{
 for(const options of [{first:missingContext,enabled:false},{first:missingContext,root:login('99')},{first:missingContext,root:missingContext},{first:{...missingContext,html:missingContext.html+'<h2>You must be 18 years old. Log in.</h2>'}}]){
  const {calls,request}=fixture(options);await assert.rejects(()=>request({},{}));assert.equal(calls.some(x=>x.url.endsWith('/api/graphql/')),false);
 }
});

test('comment token refresh accepts only missing context and never retries login or native auth gates',async()=>{
 const ready=fixture({first:missingContext,enabled:false,missingEnabled:true});await ready.request({variables:JSON.stringify({id:'123',cursor:'native-saved'})},{});assert.equal(ready.calls.length,3);assert.equal(JSON.parse(new URLSearchParams(ready.calls[2].options.body).get('variables')).cursor,'native-saved');
 const loginGate=fixture({enabled:false,missingEnabled:true});await assert.rejects(()=>loginGate.request({},{}),e=>e.code==='AUTH_REQUIRED');assert.equal(loginGate.calls.length,1);
 const nativeGate=fixture({first:missingContext,enabled:false,missingEnabled:true,feed:'{"error":1,"errorSummary":"Login required"}'});await assert.rejects(()=>nativeGate.request({},{}),e=>e.code==='AUTH_REQUIRED');assert.equal(nativeGate.calls.length,3);
});
