import test from 'node:test';import assert from 'node:assert/strict';
import {selectConfirmedHeldImport} from '../src/newsFlow/heldImportReconciliation.mjs';
const item={doc:{_id:'own',_index:'master202648',_type:'newsTopic',_source:{url:'https://publisher.test/a',siteName:'publisher.test',publishedDate:'2026-11-24T01:02:03.000Z'}}};
const hit=(id='own',index='master202648',fields={})=>({found:true,_id:id,_index:index,_type:'newsTopic',_source:{...item.doc._source,...fields}});
const options={same:(h,i)=>h._source.url===i.doc._source.url,publicationVerified:true};
test('confirms the exact interrupted target without choosing a historical duplicate by order',()=>{
 const own=hit(),old=hit('legacy');for(const hits of [[old,own],[own,old]])assert.equal(selectConfirmedHeldImport(item,hits,options),own);
 assert.equal(selectConfirmedHeldImport(item,[old,hit('legacy2')],options),null);
});
test('requires proof, publisher, native identity, original clock and a successful ES read',()=>{
 for(const candidate of [hit('own','master202648',{siteName:'foreign.test'}),hit('own','master202648',{url:'https://publisher.test/b'}),hit('own','master202648',{publishedDate:'2026-11-24T01:03:03Z'}),{...hit(),found:false},{...hit(),error:{type:'read_error'}}])assert.equal(selectConfirmedHeldImport(item,[candidate],options),null);
 assert.equal(selectConfirmedHeldImport(item,[hit()],{...options,publicationVerified:false}),null);
});
test('historical minute truncation requires explicit evidence and cannot hide a minute or second offset',()=>{
 const minute=hit('legacy','master202648',{publishedDate:'2026-11-24T01:02:00Z'});
 assert.equal(selectConfirmedHeldImport(item,[minute],options),null);
 assert.equal(selectConfirmedHeldImport(item,[minute],{...options,allowLegacyMinute:true}),minute);
 for(const publishedDate of ['2026-11-24T01:01:00Z','2026-11-24T01:02:02Z'])assert.equal(selectConfirmedHeldImport(item,[hit('legacy','master202648',{publishedDate})],{...options,allowLegacyMinute:true}),null);
});
