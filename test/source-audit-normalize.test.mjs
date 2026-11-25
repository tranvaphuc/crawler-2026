import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSource} from '../scripts/source_audit_normalize.mjs';
import {parseMetadata} from '../scripts/source_audit_metadata.mjs';
test('Google Maps selects the business feature after the contextual street address',()=>{
 const url='https://www.google.com/maps/place/Hospital/data=!1s0x31a089b382b02b9b:0x8a8152856aad44e9!3m5!1s0x31a089b39ccc117d:0x197f09aa1306b8ec';
 const r=parseMetadata({channel:'GG Reviews',url,type:'place'},{status:200,url,body:'<title>Hospital - Google Maps</title>'});
 assert.equal(r.cid,'1837197799058749676');
 assert.equal(r.url,'https://www.google.com/maps?cid=1837197799058749676');
});
test('compound Facebook links retain the original until the source is verified',()=>{
 const r=normalizeSource('https://www.facebook.com/656342367724454_1289415566559038');
 assert.equal(r.url,'https://www.facebook.com/656342367724454_1289415566559038');assert.equal(r.ownerCandidate,'656342367724454');assert.ok(r.unresolved);assert.equal(r.sourceKey,undefined);
 const comment=normalizeSource('https://facebook.com/1211103321113603_1562283098069982');
 assert.ok(comment.unresolved);assert.equal(comment.sourceKey,undefined);
 assert.equal(normalizeSource('https://facebook.com/groups/123/posts/456/').url,'https://www.facebook.com/groups/123/');
 assert.equal(normalizeSource('https://facebook.com/story.php?story_fbid=456&id=123').sourceKey,'profile:123');
 assert.ok(normalizeSource('https://facebook.com/photo.php?fbid=456').unresolved);
});
test('content URLs normalize to channel/profile/domain where the owner is in the URL',()=>{
 assert.equal(normalizeSource('https://www.tiktok.com/@abc/video/123').url,'https://www.tiktok.com/@abc');
 assert.equal(normalizeSource('https://threads.net/@abc/post/XYZ').url,'https://www.threads.com/@abc');
 assert.equal(normalizeSource('https://www.instagram.com/abc/reel/XYZ/').url,'https://www.instagram.com/abc/');
 assert.equal(normalizeSource('https://www.instagram.com/stories/dai250306/3876322086821659750').url,'https://www.instagram.com/dai250306/');
 assert.equal(normalizeSource('https://www.baomoi.com/news/story.htm','News').id,'baomoi.com');
 assert.notEqual(normalizeSource('https://youtu.be/ABCD').key,normalizeSource('https://youtu.be/abcd').key);
});
test('Instagram owner metadata and LinkedIn organization URN select source IDs',()=>{
 let r=parseMetadata({channel:'Instagram',url:'https://instagram.com/p/ABC',type:'profile'},{status:200,url:'https://instagram.com/p/ABC',body:'<title>Brand on Instagram: hello</title><meta property="instapp:owner_user_id" content="12345"/><script>{"user":{"pk":"12345","username":"brand"}}</script>'});
 assert.equal(r.id,'12345');assert.equal(r.url,'https://www.instagram.com/brand/');assert.equal(r.name,'Brand');
 r=parseMetadata({channel:'LinkedIn',url:'https://linkedin.com/company/example',type:'company'},{status:200,url:'https://linkedin.com/company/example',body:'<title>Example | LinkedIn</title><button data-semaphore-content-urn="urn:li:organization:100881526"></button>'});
 assert.equal(r.id,'100881526');assert.equal(r.status,'live');
});
