import test from 'node:test';import assert from 'node:assert/strict';
import {validateHistoricalTimeMapping} from '../src/newsFlow/historicalTimeRepair.mjs';
test('historical week migration preserves already mapped legacy fields without changing mappings',()=>{
 const source={publishedDate:'2025-03-14T10:56:40Z',title:'Original article',place:'Vietnam'},mapping={publishedDate:{type:'date'},title:{type:'text'},place:{type:'keyword'}};
 assert(validateHistoricalTimeMapping(source,mapping,structuredClone(mapping)));
 assert.throws(()=>validateHistoricalTimeMapping(source,mapping,{...mapping,place:{type:'text'}}),/MAPPING_NOT_IDENTICAL_place/);
 const missing={...mapping};delete missing.place;assert.throws(()=>validateHistoricalTimeMapping(source,mapping,missing),/MAPPING_NOT_IDENTICAL_place/);
 assert.throws(()=>validateHistoricalTimeMapping({...source,publishedDate:'invalid'},mapping,mapping),/PUBLICATION_DATE_INVALID/);
});
