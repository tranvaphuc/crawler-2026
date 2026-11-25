import test from'node:test';import assert from'node:assert/strict';
import{hasYoutubeCommentNodes,walkContent,extractContentSnapshot}from'../src/services/socialContent.js';
import{youtubeHttpUi}from'../src/services/socialHttpReaders.js';
import{assignedJson,readOnlyAssignedJson,readOnlyAssignmentYoutubeCommentPresence}from'../src/services/socialMetrics.js';
const readonly=raw=>readOnlyAssignedJson('var ytInitialData = '+raw+';','ytInitialData');
const snapshot=initial=>({httpStatus:200,finalUrl:'https://www.youtube.com/watch?v=abcdefghijk',html:'<script>var ytInitialData = '+initial+';var ytInitialPlayerResponse = {"videoDetails":{"videoId":"abcdefghijk"}};</script>',jsonResponses:[]});
const target={platform:'youtube',operation:'comments',id:'abcdefghijk',url:'https://www.youtube.com/watch?v=abcdefghijk'};
test('native key presence handles escaped keys without treating text or metadata as comment nodes',()=>{
 for(const key of['commentRenderer','commentEntityPayload']){const raw='{"nested":{"'+key.replace('comment','comm\\u0065nt')+'":{"id":"native"}}}';assert.equal(hasYoutubeCommentNodes(readonly(raw)),true);}
 assert.equal(hasYoutubeCommentNodes(readonly(JSON.stringify({contents:{videoRenderer:{videoId:'other'}},text:'{"commentRenderer":{}}'}))),false);
 const mutable=assignedJson('var ytInitialData = {"nested":{}};','ytInitialData');Object.freeze(mutable);assert.equal(readOnlyAssignmentYoutubeCommentPresence(mutable),undefined);assert.equal(hasYoutubeCommentNodes(mutable),true);mutable.nested.commentRenderer={};assert.equal(hasYoutubeCommentNodes(mutable),true);
});
test('negative prefilter cannot suppress native identity or relax secondary/reply scope',()=>{
 const empty=youtubeHttpUi(target,snapshot('{"contents":{"videoRenderer":{"videoId":"other"}}}'));assert.deepEqual(empty.commentItems,[]);const result=extractContentSnapshot(target,snapshot('{"contents":{"videoRenderer":{"videoId":"other"}}}'),empty);assert.equal(result.identityVerified,true);assert.equal(result.nativePostId,target.id);assert.notEqual(result.pagination.complete,true);
 const encoded=[...'commentRenderer'].map(c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join('');const encodedOnly='{"primary":{"'+encoded+'":{"commentId":"ENCODED"}}}';assert.deepEqual(youtubeHttpUi(target,snapshot(encodedOnly)).commentItems.map(x=>x.id),['ENCODED']);
 const renderer={commentRenderer:{commentId:'ROOT',contentText:{simpleText:'native'},authorText:{simpleText:'author'}}};
 const raw=JSON.stringify({primary:renderer,secondaryResults:{commentRenderer:{commentId:'FOREIGN'}},commentEntityPayload:{properties:{commentId:'MISSING.child',replyLevel:1}}}).replace('commentRenderer','comm\\u0065ntRenderer');
 assert.deepEqual(youtubeHttpUi(target,snapshot(raw)).commentItems.map(x=>x.id),['ROOT']);
});
test('unregistered cyclic or custom objects retain the original depth-bounded walk',()=>{
 const cyclic={};cyclic.next=cyclic;assert.equal(hasYoutubeCommentNodes(cyclic),true);let n=0;walkContent(cyclic,()=>n++);assert.equal(n,66);
 assert.equal(hasYoutubeCommentNodes({nested:{commentRenderer:{}},toJSON(){return{};}}),true);
});
