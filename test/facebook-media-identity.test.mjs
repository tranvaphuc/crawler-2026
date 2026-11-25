import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeFacebookPostInput,analyzeFacebookPostHtml,facebookStoryIdentity} from '../src/services/facebookShare.js';
const html=x=>'<script type="application/json">'+JSON.stringify(x)+'</script>';
const storyId=(owner,media)=>Buffer.from(`S:_I${owner}:VK:${media}`).toString('base64');
const rows=[['https://www.facebook.com/reel/1703087494240961','1703087494240961','100064781346283','387415818028841','1478257144343650','reel'],['https://www.facebook.com/watch/?v=1574234080974249','1574234080974249','100001053057361',null,'28179006848384373','video'],['https://www.facebook.com/nsnguyenvanchung/videos/slug/1533067788652474/?mibextid=tracking','1533067788652474','100007561808205',null,'4440631052865578','video'],['https://www.facebook.com/photo/?fbid=1512675990681093&set=a.664149118867122','1512675990681093','100058161185380','1405090646463166','1512676020681090','photo']];
for(const[url,mediaId,profileId,pageId,postId,mediaType]of rows)test(`media alias ${mediaType} binds exact creation story instead of media ID`,()=>{
 const request=normalizeFacebookPostInput(url);assert.equal(request.postId,null);assert.equal(request.mediaId,mediaId);assert.equal(request.mediaType,mediaType);assert.ok(!request.url.includes('mibextid'));
 const actor={__typename:'User',id:profileId,is_additional_profile_plus:!!pageId,delegate_page:{id:pageId||'auxiliary-professional-page'}};
 const targetStory={id:storyId(profileId,mediaId),post_id:postId,actors:[actor],attached_story:null};
 const r=analyzeFacebookPostHtml(html({data:{video:{id:mediaId,creation_story:targetStory},recommended:{__typename:'Story',id:storyId('999','888'),post_id:'777',actors:[{id:'999'}]}}}),request);
 assert.equal(r.post.id,`${pageId||profileId}_${postId}`);assert.equal(r.post.url,`https://www.facebook.com/${pageId||profileId}_${postId}`);assert.equal(r.post.mediaId,mediaId);assert.notEqual(r.post.postId,mediaId);
});
test('a media reference without post evidence stays unresolved, even if owner and media ID exist',()=>{
 const request=normalizeFacebookPostInput(rows[0][0]);
 assert.equal(analyzeFacebookPostHtml(html({data:{video:{id:request.mediaId,owner:{id:'123'}}}}),request).reason,'MEDIA_POST_ID_UNVERIFIED');
 const onlyEncoded={id:storyId('123',request.mediaId),actors:[{id:'123'}]};
 assert.equal(analyzeFacebookPostHtml(html({data:{video:{id:request.mediaId,creation_story:onlyEncoded}}}),request).post,null);
});
test('conflicting media bindings are rejected instead of selecting a recommendation',()=>{
 const request=normalizeFacebookPostInput(rows[0][0]),source=id=>({id:request.mediaId,creation_story:{id:'Story'+id,post_id:id,actors:[{id:'123',is_additional_profile_plus:false}]}});
 assert.equal(analyzeFacebookPostHtml(html([source('1'),source('2')]),request).reason,'CONFLICTING_MEDIA_POST_IDENTITY');
});
test('matching media joins exact Story projections and public Page mapping',()=>{
 const request=normalizeFacebookPostInput(rows[0][0]);const id=storyId('456',request.mediaId);
 const r=analyzeFacebookPostHtml(html([{id:request.mediaId,creation_story:{id}},{id,post_id:'789',actors:[{id:'456'}]},{id:'456',delegate_page:{id:'123'},is_additional_profile_plus:true}]),request);
 assert.equal(r.post.id,'123_789');
});
test('an explicit personal profile is canonical even when Facebook supplies a delegate Page',()=>{
 const r=facebookStoryIdentity({post_id:'456',actors:[{__typename:'User',id:'123',is_additional_profile_plus:false,delegate_page:{id:'999'}}]});assert.equal(r.id,'123_456');assert.equal(r.pageId,null);assert.equal(r.ownerIdType,'user');
});
test('media URL normalization keeps SSRF protection and does not accept malformed IDs',()=>{
 for(const input of ['https://evil.test/reel/123','https://facebook.com@evil.test/photo/?fbid=123','https://facebook.com:444/watch/?v=123','https://facebook.com/reel/nope','https://facebook.com/photo/?fbid=nan'])assert.throws(()=>normalizeFacebookPostInput(input));
});
import fs from 'node:fs/promises';
for(const name of ['reel','watch','video','photo'])test(`observed anonymous ${name} metadata resolves the user's expected system ID`,async()=>{
 const f=JSON.parse(await fs.readFile(new URL(`fixtures/facebook-media/${name}.json`,import.meta.url)));const r=analyzeFacebookPostHtml(html(f.payload),normalizeFacebookPostInput(f.url));
 assert.equal(r.post.id,f.expected);assert.equal(r.post.systemId,f.expected);assert.equal(r.post.url,'https://www.facebook.com/'+f.expected);assert.equal(r.post.sourceId,f.expected.split('_')[0]);
});
test('a later partial projection cannot erase an explicit personal-profile flag',()=>{
 const request=normalizeFacebookPostInput(rows[1][0]);const actorId='100001053057361';
 const r=analyzeFacebookPostHtml(html([{id:request.mediaId,creation_story:{id:storyId(actorId,request.mediaId),post_id:'28179006848384373',actors:[{id:actorId}]}},{id:actorId,is_additional_profile_plus:false,delegate_page:{id:'425472633978069'}},{id:actorId,delegate_page:{id:'425472633978069'}}]),request);
 assert.equal(r.post.id,'100001053057361_28179006848384373');
});
test('joining an untrusted projection cannot mutate object prototypes',()=>{
 const request=normalizeFacebookPostInput(rows[0][0]);const payload=JSON.parse('{"id":"1703087494240961","creation_story":{"id":"S","post_id":"789","actors":[{"id":"123"}],"__proto__":{"polluted":true}}}');
 analyzeFacebookPostHtml(html(payload),request);assert.equal({}.polluted,undefined);
});
test('a media post never publishes an unresolved Profile ID as canonical source ID',()=>{
 const request=normalizeFacebookPostInput(rows[0][0]);
 const r=analyzeFacebookPostHtml(html({id:request.mediaId,creation_story:{id:'primary',post_id:'789',actors:[{__typename:'User',id:'123'}]}}),request);
 assert.equal(r.post,null);assert.equal(r.reason,'MEDIA_SOURCE_ID_UNVERIFIED');
});
test('owner video links use the exact media ID watch endpoint while retaining input URL',()=>{
 const u='https://www.facebook.com/nsnguyenvanchung/videos/slug/1533067788652474/?mibextid=tracking';const r=normalizeFacebookPostInput(u);
 assert.equal(r.url,'https://www.facebook.com/watch/?v=1533067788652474');assert.equal(r.inputUrl,'https://www.facebook.com/nsnguyenvanchung/videos/slug/1533067788652474/');assert.equal(r.postId,null);
});
