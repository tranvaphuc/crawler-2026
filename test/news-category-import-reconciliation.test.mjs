import test from 'node:test';import assert from 'node:assert/strict';import {categoryImportDecision} from '../src/newsFlow/categoryImportReconciliation.mjs';
const doc={_index:'master202647',_type:'newsTopic',_id:'id',_source:{url:'https://example.com/one',title:'Original report',content:'Original native body',publishedDate:'2026-11-20T09:00:00.000Z',insertedDate:'2026-11-23T03:00:00.000Z',likes:0}},hit={...doc,found:true};
test('an earlier insertion timestamp and engagement do not turn an existing matching article into a miss',()=>{
 assert.equal(categoryImportDecision(doc,hit),'confirmed_exact_existing');assert.equal(categoryImportDecision(doc,{...hit,_source:{...doc._source,insertedDate:'2026-11-20T09:05:00.000Z',likes:10}}),'confirmed_existing_native_fields');
});
test('publication, identity or native payload differences remain held and no ES document is changed',()=>{
 for(const patch of [{publishedDate:'2026-11-20T08:00:00.000Z'},{content:'Different text'},{title:'Another story'},{url:'https://example.com/two'}])assert.equal(categoryImportDecision(doc,{...hit,_source:{...doc._source,...patch}}),'held_for_document_review');
 assert.equal(categoryImportDecision(doc,{...hit,_id:'other'}),'held_for_document_review');assert.equal(categoryImportDecision(doc,{...hit,error:{type:'unavailable'}}),'held_for_document_review');assert.equal(doc._source.likes,0);
});
test('only a complete exact identity read proving absence permits the existing writer to retry',()=>{
 assert.equal(categoryImportDecision(doc,{...hit,found:false}),'requeued_after_confirmed_absence');assert.equal(categoryImportDecision(doc,{...hit,found:false,_index:'master202646'}),'held_for_document_review');assert.equal(categoryImportDecision(doc,{...hit,found:undefined}),'held_for_document_review');
});
