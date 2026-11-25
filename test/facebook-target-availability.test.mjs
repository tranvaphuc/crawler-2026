import {test} from 'node:test';
import assert from 'node:assert/strict';
import {facebookAnonymousContext} from '../src/services/facebookAnonymousGraphql.js';
const snapshot=html=>({html,httpStatus:200,finalUrl:'https://www.facebook.com/groups/test/permalink/123/'});
const token='<input name="lsd" value="anonymous-test">';
test('explicit deleted heading differs from unavailable target',()=>{
 assert.throws(()=>facebookAnonymousContext(snapshot('<h1>This post has been deleted</h1>')),e=>e.code==='POST_DELETED'&&e.stage==='bootstrap');
 for(const text of ["This content isn't available right now",'Nội dung này hiện không hiển thị'])assert.throws(()=>facebookAnonymousContext(snapshot(`<h2>${text}</h2>`)),e=>e.code==='TARGET_UNAVAILABLE'&&e.stage==='bootstrap');
});
test('unavailable target HTTP status is not a comment count of zero',()=>{
 for(const httpStatus of [404,410])assert.throws(()=>facebookAnonymousContext({...snapshot(''),httpStatus}),e=>e.code==='TARGET_UNAVAILABLE'&&e.httpStatus===httpStatus);
});
test('words inside comments or scripts do not mark target deleted',()=>{
 for(const html of [token+'<div>This post has been deleted</div>',token+'<script>"This content isn\'t available right now"</script>'])assert.equal(facebookAnonymousContext(snapshot(html)).dynamic.__user,'0');
});
test('login redirect takes precedence over generic unavailable text',()=>{
 assert.throws(()=>facebookAnonymousContext({...snapshot('<h1>This content isn\'t available</h1>'),finalUrl:'https://www.facebook.com/login/'}),e=>e.code==='AUTH_REQUIRED');
});
import {normalizeContentInput} from '../src/services/socialContent.js';
test('group permalink alias accepts public numeric post without guessing group owner',()=>{
 const t=normalizeContentInput('comments',{platform:'facebook',url:'https://www.facebook.com/groups/congdongisocialcom/permalink/3615941351894944/'});
 assert.equal(t.id,'3615941351894944');assert.equal(t.facebook.ownerId,null);
 assert.equal(t.url,'https://www.facebook.com/groups/congdongisocialcom/posts/3615941351894944/');
});
