import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFacebookPostHtml,normalizeFacebookPostInput} from '../src/services/facebookShare.js';
const url='https://www.facebook.com/groups/740563628115685/posts/1592137936291579';
const primary=()=>({group:{id:'740563628115685',url:'https://www.facebook.com/groups/740563628115685/'},node_v2:{__typename:'Story',post_id:'1592137936291579',actors:[{id:'1149238321304624',name:'Anonymous'}],creation_time:1794211022,attached_story:null,comet_sections:{content:{story:{post_id:'1592137936291579',message:{text:'Group post content'},target_group:{id:'740563628115685'}}}}}});
const html=(data,query='adp_GroupsCometLoggedOutPermalinkQueryRelayPreloader_live')=>`<script type="application/json">${JSON.stringify({require:[['RelayPrefetchedStreamCache','next',[],[query,{__bbox:{result:{data}}}]]]})}</script>`;
test('reads the logged-out group primary post and uses group identity instead of anonymous actor',()=>{
 const r=analyzeFacebookPostHtml(html(primary()),normalizeFacebookPostInput(url));
 assert.equal(r.status,'resolved');assert.equal(r.post.id,'740563628115685_1592137936291579');assert.equal(r.post.ownerIdType,'group');assert.equal(r.post.profileId,'1149238321304624');assert.equal(r.post.content,'Group post content');assert.equal(r.post.createdAt,'2026-11-09T07:57:02.000Z');
});
test('rejects wrong group, wrong post, conflicting target group and recommendation projections',()=>{
 for(const change of [d=>{d.group.id='999';d.group.url='https://www.facebook.com/groups/999/';},d=>{d.node_v2.post_id='888';},d=>{d.node_v2.comet_sections.content.story.target_group.id='999';},d=>{d.node=d.node_v2;delete d.node_v2;}]){const d=primary();change(d);const r=analyzeFacebookPostHtml(html(d),normalizeFacebookPostInput(url));assert.notEqual(r.status,'resolved');}
 const r=analyzeFacebookPostHtml(html(primary(),'GroupsCometFeedRegularStoriesPaginationQuery'),normalizeFacebookPostInput(url));assert.notEqual(r.status,'resolved');
});
