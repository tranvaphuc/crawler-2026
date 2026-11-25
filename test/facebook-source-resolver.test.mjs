import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFacebookSource,readProfileIdentity} from '../scripts/facebook_source_resolver.mjs';
test('group/user legacy links normalize without using tracking parameters',()=>{
 assert.equal(normalizeFacebookSource('https://m.facebook.com/groups/123/?ref=share').key,'group:123');
 assert.equal(normalizeFacebookSource('https://www.facebook.com/profile.php?id=100001&sk=about').route,'/100001');
 assert.equal(normalizeFacebookSource('https://www.facebook.com/pages/Example/987').route,'/987');
 assert.equal(normalizeFacebookSource('https://www.facebook.com/people/Example/123').route,'/123');
});
test('post and photo IDs are never treated as source IDs',()=>{
 assert.equal(normalizeFacebookSource('https://www.facebook.com/beatvn.network/posts/pfbid123').status,'CONTENT_REFERENCE');
 assert.equal(normalizeFacebookSource('https://www.facebook.com/photo.php?fbid=123').status,'CONTENT_REFERENCE');
 assert.equal(normalizeFacebookSource('https://www.facebook.com/groups/123/posts/456/').status,'CONTENT_REFERENCE');
});
test('profile User with delegate_page resolves to the Page ID, not the profile ID',()=>{
 const r=readProfileIdentity([{data:{actors:[{__typename:'User',id:'100044286136937',name:'Beatvn',delegate_page:{id:'1854913491492670'}}]}}],'100044286136937');
 assert.equal(r.id,'1854913491492670');assert.equal(r.profileId,'100044286136937');assert.equal(r.type,'page');
});
test('unrelated story actor cannot replace the requested source',()=>{
 assert.equal(readProfileIdentity([{data:{actors:[{__typename:'User',id:'2',name:'Other',delegate_page:{id:'999'}}]}}],'1'),null);
});
test('personal user requires an explicit identity signal',()=>{
 assert.equal(readProfileIdentity([{data:{id:'1',name:'A',__typename:'User'}}],'1'),null);
 assert.equal(readProfileIdentity([{data:{id:'1',name:'A',__typename:'User',is_additional_profile_plus:false}}],'1').type,'user');
});
test('professional personal profile does not become a Page merely because it has delegate_page',()=>{
 const r=readProfileIdentity([{data:{actors:[{__typename:'User',id:'123',name:'Person',is_additional_profile_plus:false,delegate_page:{id:'999'}}]}}],'123');assert.equal(r.type,'user');assert.equal(r.id,'123');
});
test('later incomplete delegate projection cannot erase an explicit personal-profile flag',()=>{
 const r=readProfileIdentity([{data:[{id:'123',name:'Person',is_additional_profile_plus:false},{id:'123',name:'Person',delegate_page:{id:'999'}}]}],'123');assert.equal(r.type,'user');assert.equal(r.id,'123');
});
