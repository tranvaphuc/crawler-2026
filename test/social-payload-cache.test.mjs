import test from 'node:test';import assert from 'node:assert/strict';import {snapshotPayloads}from'../src/services/socialMetrics.js';
const html='<div>unrelated markup</div><script type="application/json">{"data":{"id":"1","rows":[1,2]}}</script><script type="application/json">not JSON</script>';
test('repeated HTML extraction returns fresh mutable native objects and arrays',()=>{const a=snapshotPayloads(html);a[0].data.id='changed';a[0].data.rows.push(3);a.push({injected:true});assert.deepEqual(snapshotPayloads(html),[{data:{id:'1',rows:[1,2]}}]);});
test('fresh network responses never reuse previous responses with the same HTML',()=>{assert.deepEqual(snapshotPayloads(html,['for (;;);{"next":1}']).at(-1),{next:1});assert.deepEqual(snapshotPayloads(html,['{"next":2}\n{"next":3}']).slice(-2),[{next:2},{next:3}]);assert.equal(snapshotPayloads(html).length,1);});
test('switching HTML documents and empty network-only reads keeps native payload boundaries',()=>{snapshotPayloads(html);const other="<script data-x='1' type='application/json'>{\"owner\":\"2\"}</script>";assert.deepEqual(snapshotPayloads(other),[{owner:'2'}]);assert.deepEqual(snapshotPayloads('', ['{"only":"network"}']),[{only:'network'}]);assert.deepEqual(snapshotPayloads(html),[{data:{id:'1',rows:[1,2]}}]);});

import {assignedJson,readOnlyAssignedJson} from '../src/services/socialMetrics.js';
test('immutable assignment evidence is shared without exposing mutable native state',()=>{
 const html='var ytInitialData = {"nested":{"rows":[{"id":"one"}]}};';
 const a=readOnlyAssignedJson(html,'ytInitialData');assert.equal(a,readOnlyAssignedJson(html,'ytInitialData'));
 assert.throws(()=>{a.nested.rows[0].id='bad';},TypeError);
 const fresh=assignedJson(html,'ytInitialData');fresh.nested.rows[0].id='changed';
 assert.equal(readOnlyAssignedJson(html,'ytInitialData').nested.rows[0].id,'one');
 const other=html.replace('one','two');assert.equal(readOnlyAssignedJson(other,'ytInitialData').nested.rows[0].id,'two');
 assert.equal(readOnlyAssignedJson(html,'absent'),null);
});

import {walkContent,walkContentValues} from '../src/services/socialContent.js';
test('value traversal preserves native node order, pruning and depth of path traversal',()=>{
 const inherited={foreign:{id:'inherited'}},root=Object.assign(Object.create(inherited),{id:'root',rows:[{id:'a',nested:{id:'a1'}},{id:'pruned',nested:{id:'hidden'}}]});let deep={id:'bottom'};for(let i=0;i<70;i++)deep={id:'depth'+i,next:deep};root.deep=deep;
 const scan=walk=>{const ids=[];walk(root,v=>{if(v.id)ids.push(v.id);if(v.id==='pruned')return false;});return ids;};assert.deepEqual(scan(walkContentValues),scan(walkContent));assert(!scan(walkContentValues).includes('inherited'));assert(!scan(walkContentValues).includes('hidden'));assert(!scan(walkContentValues).includes('bottom'));
});
test('path traversal remains available for native scope exclusion guards',()=>{
 const seen=[];walkContent({primary:{id:'ok'},secondaryResults:{id:'foreign'}},(v,path)=>{if(/secondaryResults/.test(path))return false;if(v.id)seen.push([v.id,path]);});assert.deepEqual(seen,[['ok','.primary']]);
});
