import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {extractSocialMetrics,normalizeMetricsInput} from '../src/services/socialMetrics.js';
import {analyzeFacebookPostHtml,normalizeFacebookPostInput,extractFacebookPostDetails} from '../src/services/facebookShare.js';
const fixture=JSON.parse(fs.readFileSync(new URL('fixtures/facebook-metrics/video-122141941088991375.json',import.meta.url)));
const snapshot=payloads=>({httpStatus:200,finalUrl:fixture.finalUrl,html:payloads.map(p=>'<script type="application/json">'+JSON.stringify({require:[['RelayPrefetchedStreamCache','next',[],[p.query,{__bbox:{result:p.result}}]]]})+'</script>').join('')});
const target=normalizeMetricsInput({url:'https://www.facebook.com/'+fixture.input});
const feedback=p=>p.find(x=>x.result.data?.feedback?.reaction_count)?.result.data.feedback;
test('post redirected to video reads deferred feedback from its own media, including exact zero counters',()=>{
 for(const url of ['https://www.facebook.com/'+fixture.input,'https://www.facebook.com/61579741268314/posts/122141941088991375']){
  const r=extractSocialMetrics(normalizeMetricsInput({url}),snapshot(fixture.payloads));assert.equal(r.identityVerified,true);assert.equal(r.nativeId,fixture.input);assert.equal(r.status,'partial');assert.equal(r.reason,null);assert.equal(r.metrics.reactions,0);assert.equal(r.metrics.likes,0);assert.equal(r.metrics.comment,0);assert.equal(r.metrics.views,2);assert.equal(r.metrics.shares,null);
 }
 const s=snapshot(fixture.payloads),details=analyzeFacebookPostHtml(s.html,normalizeFacebookPostInput(fixture.input));assert.equal(details.post.interactions.videoViews,2);assert.equal(details.post.interactions.reactions,0);
});
test('video play count is not substituted for views, and a renderer for another media cannot supply views',()=>{
 const p=structuredClone(fixture.payloads);feedback(p).video_view_count_renderer.feedback.associated_video.id='999';const r=extractSocialMetrics(target,snapshot(p));assert.equal(r.metrics.views,null);assert.equal(r.metrics.reactions,0);assert.notEqual(r.metrics.views,14);
});
test('shared/related media feedback cannot replace counters on a different creation story',()=>{
 const p=structuredClone(fixture.payloads),story=p[0].result.data.video.story;story.post_id='122141941088991375';story.actors=[{id:'61579741268314'}];
 for(const chunk of p){const data=chunk.result.data;for(const media of [data,...(data.attachments||[]).map(a=>a.media)])if(media?.creation_story)media.creation_story.id='OTHER_STORY';}
 assert.equal(extractSocialMetrics(target,snapshot(p)).metrics.reactions,null);
});
test('unrelated hero query or another requested post never receives these counters',()=>{
 const p=structuredClone(fixture.payloads);for(const chunk of p)chunk.query='CometRelatedVideosQuery';assert.equal(extractSocialMetrics(target,snapshot(p)).metrics.views,null);
 assert.equal(extractSocialMetrics(normalizeMetricsInput({url:'https://www.facebook.com/61579741268314_999'}),snapshot(fixture.payloads)).metrics.reactions,null);
});
test('missing counters remain unknown, while deferred projections can precede the initial hero',()=>{
 const p=structuredClone(fixture.payloads);delete feedback(p).reaction_count;assert.equal(extractSocialMetrics(target,snapshot(p)).metrics.reactions,null);
 const r=extractSocialMetrics(target,snapshot([...fixture.payloads].reverse()));assert.equal(r.nativeId,fixture.input);assert.equal(r.metrics.views,2);
});
test('same feedback ID supplements an incomplete story summary with its own video counters',()=>{
 const p=structuredClone(fixture.payloads);p[0].result.data.video.story.feedback={id:feedback(p).id,reaction_count:{count:0}};
 const r=extractSocialMetrics(target,snapshot(p));assert.equal(r.metrics.comment,0);assert.equal(r.metrics.views,2);
});
test('different feedback IDs cannot supplement the primary story',()=>{
 const p=structuredClone(fixture.payloads);p[0].result.data.video.story.feedback={id:'other-feedback',reaction_count:{count:7}};
 const r=extractSocialMetrics(target,snapshot(p));assert.equal(r.metrics.reactions,7);assert.equal(r.metrics.comment,null);assert.equal(r.metrics.views,null);
});
test('conflicting exact counts in deferred video patches are rejected in either arrival order',()=>{
 const p=structuredClone(fixture.payloads),chunk=structuredClone(p.find(x=>x.result.data?.feedback?.reaction_count));chunk.result.data.feedback.reaction_count.count=9;p.push(chunk);
 for(const chunks of [p,[...p].reverse()]){const r=extractSocialMetrics(target,snapshot(chunks));assert.equal(r.identityVerified,false);assert.ok(Object.values(r.metrics).every(x=>x===null));}
});
test('verified feedback accepts exact counter variants, preserves missing values, and rejects disagreements',()=>{
 const story={feedback:{unified_reactors:{count:12},likers:{count:8},total_comment_count:3,share_count_reduced:'2',video_view_count:{count:0}}};
 let i=extractFacebookPostDetails(story).interactions;assert.equal(i.reactions,12);assert.equal(i.likes,8);assert.equal(i.comments,3);assert.equal(i.shares,2);assert.equal(i.videoViews,0);
 story.feedback.reaction_count={count:13};story.feedback.comment_rendering_instance={comments:{total_count:4}};story.feedback.share_count_reduced='1.2K';
 i=extractFacebookPostDetails(story).interactions;assert.equal(i.reactions,null);assert.equal(i.comments,4);assert.equal(i.nativeTotalCommentCount,3);assert.equal(i.shares,null);
});
test('watch, video and reel URLs bind counters to the exact media without claiming an unknown canonical Page alias',()=>{
 for(const url of ['https://www.facebook.com/watch/?v=1579559363548547',fixture.finalUrl,'https://www.facebook.com/reel/1579559363548547/']){
  const t=normalizeMetricsInput({url}),r=extractSocialMetrics(t,snapshot(fixture.payloads));assert.equal(r.identityVerified,true);assert.equal(r.nativeId,'1579559363548547');assert.equal(r.nativePostId,'122141941088991375');assert.deepEqual(r.nativeIdentityAliases,['1579559363548547']);assert.equal(r.metrics.views,2);assert.equal(r.metrics.reactions,0);
 }
 // Source/post-info consumers still require a verified canonical source alias.
 const s=snapshot(fixture.payloads);assert.notEqual(analyzeFacebookPostHtml(s.html,normalizeFacebookPostInput(fixture.finalUrl)).status,'resolved');
 const t=normalizeMetricsInput({url:'https://www.facebook.com/watch/?v=999'});assert.equal(extractSocialMetrics(t,s).identityVerified,false);
});
test('object and scalar view-count projections must agree before they can be merged',()=>{
 for(const views of [2,99]){
  const p=structuredClone(fixture.payloads);p[0].result.data.video.story.feedback={id:feedback(p).id,video_view_count:{count:views}};
  const r=extractSocialMetrics(target,snapshot(p));assert.equal(r.identityVerified,views===2);assert.equal(r.metrics.views,views===2?2:null);
 }
});
test('SinglePost attached video play_count stays separate from views',()=>{
 const story={__typename:'Story',id:Buffer.from('S:_I1:2').toString('base64'),post_id:'2',actors:[{__typename:'Page',id:'1'}],attached_story:null,feedback:{reaction_count:{count:4}},attachments:[{media:{__typename:'Video',id:'3',play_count:850}}]};
 const html=()=>'<script type="application/json">'+JSON.stringify({require:[['RelayPrefetchedStreamCache','next',[],['CometSinglePostRootQuery',{__bbox:{result:{data:{node_v2:story}}}}]]]})+'</script>',t=normalizeMetricsInput({url:'https://www.facebook.com/1_2'});
 let r=extractSocialMetrics(t,{html:html()});assert.equal(r.metrics.reactions,4);assert.equal(r.metrics.views,null);assert.equal(r.extraMetrics['primary_post.attached_video.play_count'],850);
 story.attachments[0].media.video_view_count={count:17};r=extractSocialMetrics(t,{html:html()});assert.equal(r.metrics.views,17);
});
test('native total comments do not erase the differently scoped public-list count',()=>{
 const f=JSON.parse(fs.readFileSync(new URL('fixtures/facebook-metrics/video-29156234290626604.json',import.meta.url))),t=normalizeMetricsInput({url:'https://www.facebook.com/'+f.input});
 const r=extractSocialMetrics(t,{...snapshot(f.payloads),finalUrl:f.finalUrl});assert.equal(r.identityVerified,true);assert.equal(r.metrics.comment,1);assert.equal(r.extraMetrics['primary_feedback.total_comment_count'],2);assert.equal(r.metrics.reactions,29);assert.equal(r.metrics.views,189);
});
