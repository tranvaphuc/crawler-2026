import test from 'node:test';
import assert from 'node:assert/strict';
import {assignedJson} from '../src/services/socialMetrics.js';

test('assigned JSON preserves escaped braces and returns independent mutable parses',()=>{
 const value={id:'native',text:'escaped \\" } {',nested:[{value:1}]};
 const html='<script>var ytInitialData = '+JSON.stringify(value)+';</script>';
 const first=assignedJson(html,'ytInitialData');assert.deepEqual(first,value);
 first.nested[0].value=9;first.nested.push('injected');assert.deepEqual(assignedJson(html,'ytInitialData'),value);
});
test('document and marker boundaries preserve missing, malformed and first-assignment semantics',()=>{
 const a='window["ytInitialData"] = {"id":"a"}; var ytInitialPlayerResponse={"id":"p"}',b='var ytInitialData={"id":"b"}';
 for(let i=0;i<3;i++){assert.deepEqual(assignedJson(a,'ytInitialData'),{id:'a'});assert.deepEqual(assignedJson(b,'ytInitialData'),{id:'b'});assert.deepEqual(assignedJson(a,'ytInitialPlayerResponse'),{id:'p'});assert.equal(assignedJson(b,'ytInitialPlayerResponse'),null);}
 for(const malformed of ['x={"id":','x={bad};x={"id":"later"}','x={"id":"unterminated}']){assert.equal(assignedJson(malformed,'x'),null);assert.equal(assignedJson(malformed,'x'),null);}
 assert.deepEqual(assignedJson('var a$b={"id":1}','a$b'),{id:1});
});
test('large documents and many markers retain exact parser behavior after cache eviction',()=>{
 const huge=' '.repeat(2*1024*1024+1)+'var x={"id":"large"}';assert.deepEqual(assignedJson(huge,'x'),{id:'large'});
 const html=Array.from({length:20},(_,i)=>'var m'+i+'={"id":'+i+'};').join('');
 for(let pass=0;pass<2;pass++)for(let i=0;i<20;i++)assert.deepEqual(assignedJson(html,'m'+i),{id:i});
 for(let i=0;i<6;i++)assert.deepEqual(assignedJson('var x={"id":'+i+'}','x'),{id:i});
});
