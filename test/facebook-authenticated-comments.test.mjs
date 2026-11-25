import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';
import{loadFacebookCommentSession,facebookAuthenticatedContext,createAuthenticatedFacebookGraphqlRequest}from'../src/services/facebookAuthenticatedGraphql.js';
const snapshot=(actor='123')=>({httpStatus:200,finalUrl:'https://www.facebook.com/groups/111/posts/222/',html:'<script type="application/json">'+JSON.stringify({require:[['CurrentUserInitialData',[],{USER_ID:actor}],['LSD',[],{token:'owned-lsd'}],['DTSGInitialData',[],{token:'owned-dtsg'}]]})+'</script>'});
test('loads only private server files, rejects symlinks, foreign accounts and unsafe headers without exposing credentials',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'facebook-auth-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'session.json');const write=value=>{fs.writeFileSync(file,JSON.stringify(value),{mode:0o600});fs.chmodSync(file,0o600);};
 write({accountId:'123',cookie:'c_user=123; xs=owned-secret'});assert.equal(loadFacebookCommentSession(file).accountId,'123');fs.chmodSync(file,0o644);assert.throws(()=>loadFacebookCommentSession(file),e=>e.code==='FACEBOOK_SESSION_FILE_INVALID'&&!e.message.includes('owned-secret'));fs.chmodSync(file,0o600);fs.symlinkSync(file,path.join(dir,'link'));assert.throws(()=>loadFacebookCommentSession(path.join(dir,'link')));
 for(const cookie of ['c_user=456; xs=owned-secret','c_user=123','c_user=123; xs=owned-secret\r\nInjected: yes']){write({accountId:'123',cookie});assert.throws(()=>loadFacebookCommentSession(file),e=>e.code==='FACEBOOK_SESSION_FILE_INVALID');}
});
test('authenticated bootstrap requires the configured actor and fresh CSRF',()=>{
 assert.equal(facebookAuthenticatedContext(snapshot(),'123').dynamic.__user,'123');assert.throws(()=>facebookAuthenticatedContext(snapshot('999'),'123'),e=>e.code==='FACEBOOK_SESSION_ACCOUNT_MISMATCH');assert.throws(()=>facebookAuthenticatedContext({...snapshot(),finalUrl:'https://www.facebook.com/checkpoint/'},'123'));
});
test('server credentials initialize the private jar while captured auth and stale actors are never replayed',async()=>{
 const calls=[],seeds=[],session={seedFacebookCookies:value=>seeds.push(value),async request(url,options={}){calls.push({url,options});return url.includes('/api/graphql/')?{httpStatus:200,finalUrl:url,html:'{"data":{"node":{}}}'}:snapshot();}};
 const request=createAuthenticatedFacebookGraphqlRequest(session,{bootstrapUrl:snapshot().finalUrl,credentials:{accountId:'123',cookie:'c_user=123; xs=owned-secret'}});
 await request({__user:'999',av:'999',fb_dtsg:'old',access_token:'do-not-send',variables:'{"id":"222"}'},{cookie:'do-not-send',authorization:'do-not-send'});
 assert.equal(seeds.length,1);const sent=calls.at(-1).options,body=new URLSearchParams(sent.body);assert.equal(body.get('__user'),'123');assert.equal(body.get('av'),'123');assert.equal(body.get('fb_dtsg'),'owned-dtsg');assert.equal(body.get('lsd'),'owned-lsd');assert.equal(body.get('access_token'),null);assert.equal(sent.headers.cookie,undefined);assert.equal(sent.headers.authorization,undefined);
});
test('a login/session failure never falls back to an unrelated anonymous account',async()=>{
 let n=0;const request=createAuthenticatedFacebookGraphqlRequest({seedFacebookCookies(){},async request(){n++;return snapshot('0');}},{bootstrapUrl:snapshot().finalUrl,credentials:{accountId:'123',cookie:'c_user=123; xs=owned-secret'}});
 await assert.rejects(request({},{}),e=>e.code==='FACEBOOK_SESSION_ACCOUNT_MISMATCH');assert.equal(n,1);
});
