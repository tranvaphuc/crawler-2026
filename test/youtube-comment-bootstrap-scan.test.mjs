import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeContinuations} from '../src/services/socialHttpReaders.js';
const target={platform:'youtube',operation:'comments',includeReplies:false};
const endpoint=token=>({continuationItemRenderer:{continuationEndpoint:{continuationCommand:{token},commandMetadata:{webCommandMetadata:{apiUrl:'/youtubei/v1/next'}}}}});
const section=token=>({itemSectionRenderer:{targetId:'comments-section',contents:[endpoint(token)],secondaryResults:[endpoint('foreign')],replies:[endpoint('reply')]}});
const html=token=>'<script>var ytInitialData = '+JSON.stringify(section(token))+';</script>';
test('bootstrap discovery preserves regular-section priority and native scope exclusions',()=>{
 const snapshot={html:html('primary'),jsonResponses:[JSON.stringify({engagementPanelSectionListRenderer:{panelIdentifier:'comments-panel',content:[endpoint('panel')]}})]};
 assert.deepEqual(youtubeContinuations(snapshot,target).map(x=>x.token),['primary']);
 const first=youtubeContinuations(snapshot,target);first[0].token='mutated';
 assert.deepEqual(youtubeContinuations(snapshot,target).map(x=>x.token),['primary']);
});
test('bootstrap evidence is invalidated when HTML or any network response changes',()=>{
 const snapshot={html:html('first'),jsonResponses:[]};
 assert.equal(youtubeContinuations(snapshot,target)[0].token,'first');
 snapshot.html=html('second');assert.equal(youtubeContinuations(snapshot,target)[0].token,'second');
 snapshot.html='';snapshot.jsonResponses.push(JSON.stringify(section('network')));assert.equal(youtubeContinuations(snapshot,target)[0].token,'network');
 snapshot.jsonResponses[0]=JSON.stringify(section('replacement'));assert.equal(youtubeContinuations(snapshot,target)[0].token,'replacement');
 snapshot.jsonResponses.length=0;assert.deepEqual(youtubeContinuations(snapshot,target),[]);
});
test('continuation JSON cannot borrow cached bootstrap tokens or reply scope',()=>{
 const snapshot={html:html('bootstrap'),jsonResponses:[]};youtubeContinuations(snapshot,target);
 const response={onResponseReceivedEndpoints:[{appendContinuationItemsAction:{targetId:'comments-section',continuationItems:[endpoint('next')]}}]};
 assert.deepEqual(youtubeContinuations(snapshot,target,{response}).map(x=>x.token),['next']);
 assert.deepEqual(youtubeContinuations(snapshot,target,{response,reply:true}),[]);
 assert.deepEqual(youtubeContinuations(snapshot,target,{response:{onResponseReceivedEndpoints:[]}}),[]);
});
