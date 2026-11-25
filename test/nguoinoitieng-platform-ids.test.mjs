import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAccount,facebookRouteIdentity} from '../scripts/resolve_nguoinoitieng_platform_ids.mjs';

test('legacy Facebook tabs and named ID URLs preserve account identity',()=>{
 assert.equal(normalizeAccount('facebook','https://www.facebook.com/Someone/timeline').key,'facebook:profile:someone');
 assert.equal(normalizeAccount('facebook','https://web.facebook.com/p/Some-Name-100078609590477/?locale=vi_VN').urlId,'100078609590477');
 assert.throws(()=>normalizeAccount('facebook','https://www.facebook.com/ahttps://www.facebook.com/b/'));
 assert.throws(()=>normalizeAccount('facebook','https://www.facebook.com/a/posts/12345'));
 assert.throws(()=>normalizeAccount('facebook','https://example.org/someone'));
});
test('YouTube native channel ID is distinct from a user handle',()=>{
 assert.equal(normalizeAccount('youtube','https://youtube.com/channel/UCCuoXy-TcFWSlqCwbU-TQcg').urlId,'UCCuoXy-TcFWSlqCwbU-TQcg');
 assert.equal(normalizeAccount('youtube','https://youtube.com/user/sodapop738').urlId,null);
 assert.throws(()=>normalizeAccount('youtube','https://youtube.com/watch?v=abc'));
});
const fixture=(name,props)=>({payload:{payloads:{'/example':{result:{exports:{canonicalRouteName:name,rootView:{props}}}}}}});
test('Facebook route match excludes viewer and error IDs',()=>{
 const result=facebookRouteIdentity(fixture('comet.fbweb.CometProfilePlusLoggedOutRoute',{userID:'100044336864056',viewerID:'999999999'}),'/example');
 assert.equal(result.id,'100044336864056');assert.equal(result.profile_id,result.id);assert.equal(result.id_type,'profile_id');assert.equal(result.page_id,null);
 assert.equal(facebookRouteIdentity(fixture('comet.fbweb.CometErrorRoute',{userID:'100044336864056'}),'/example').status,'unresolved');
 assert.equal(facebookRouteIdentity(fixture('comet.fbweb.CometLoginRoute',{userID:'100044336864056'}),'/example').status,'blocked');
 assert.equal(facebookRouteIdentity(fixture('comet.fbweb.CometProfilePlusLoggedOutRoute',{userID:'pfbidOpaque'}),'/example').status,'unresolved');
 assert.equal(facebookRouteIdentity(fixture('comet.fbweb.CometProfilePlusLoggedOutRoute',{userID:'100044336864056'}),'/other').status,'unresolved');
});
test('Facebook Page ID and profile UID remain separate',()=>{
 const result=facebookRouteIdentity(fixture('comet.fbweb.CometPageRoute',{pageID:'581903168497570',userID:'100044336864056'}),'/example');
 assert.equal(result.id,'581903168497570');assert.equal(result.page_id,result.id);assert.equal(result.profile_id,'100044336864056');
});
