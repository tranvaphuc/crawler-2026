import test from 'node:test';
import assert from 'node:assert/strict';
import {createEs5ReferenceLookup,selectReferenceIndices} from '../src/services/socialSystemReference.js';
const hit=id=>({_id:id,_type:'youtubeTopic',_source:{url:'https://www.youtube.com/watch?v='+id,siteId:'UCfixture'}});
const query=id=>({id,platform:'youtube',kind:'post'});
const indexNow=()=>Date.parse('2026-11-05T16:00:00Z');
test('a transient ES index-list failure does not poison subsequent API lookups',async()=>{
 let lists=0;
 const lookup=createEs5ReferenceLookup({indexNow,client:{cat:{indices:async()=>{if(++lists===1)throw Error('temporary network failure');return[{index:'master202645',status:'open','docs.count':'1'}];}},search:async()=>({_shards:{failed:0},hits:{hits:[hit('abcdefghijk')]}})}});
 await assert.rejects(lookup(query('abcdefghijk')),e=>e.status===503);
 assert.equal((await lookup(query('abcdefghijk'))).id,'abcdefghijk');assert.equal(lists,2);
});
test('API index discovery refreshes for a new weekly master and shares concurrent refreshes',async()=>{
 let clock=0,lists=0;const searched=[];
 const lookup=createEs5ReferenceLookup({indexNow,now:()=>clock,indexCacheTtlMs:100,client:{cat:{indices:async()=>[{index:++lists===1?'master202644':'master202645',status:'open','docs.count':'1'}]},search:async args=>{searched.push(args.index);const id=args.body.query.bool.filter.at(-1).term._id;return{_shards:{failed:0},hits:{hits:[hit(id)]}};}}});
 await Promise.all([lookup(query('abcdefghijk')),lookup(query('bcdefghijkl'))]);assert.equal(lists,1);assert.deepEqual(searched,['master202644','master202644']);
 clock=101;await Promise.all([lookup(query('cdefghijklm')),lookup(query('defghijklmn'))]);assert.equal(lists,2);assert.deepEqual(searched.slice(2),['master202645','master202645']);
});
test('future-dated and invalid-week indices cannot displace current API reference indices',()=>{
 const rows=['master206844','master206838','master202699','master202654','master202646','master202645','master202644'].map(index=>({index,status:'open','docs.count':'1'}));
 assert.deepEqual(selectReferenceIndices(rows,{at:new Date(indexNow())}),['master202646','master202645','master202644']);
 assert.deepEqual(selectReferenceIndices([{index:'master202601',status:'open','docs.count':'1'},{index:'master202552',status:'open','docs.count':'1'},{index:'master202602',status:'open','docs.count':'1'}],{at:new Date('2025-12-28T12:00:00Z')}),['master202601','master202552']);
});
