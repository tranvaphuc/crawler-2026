import test from 'node:test';
import assert from 'node:assert/strict';
import ES from 'elasticsearch';
import {createEs5BulkWriter} from '../src/services/crawlerEs5Bulk.js';
import {commitCrawlDocument} from '../src/services/crawlerPostHandoff.js';
import {serializeCrawlItem,verifyDocumentMapping} from '../src/services/crawlerV8Es5.js';
const doc=id=>({_index:'master',_type:'post',_id:id,_source:{content:'text\nwith newline'}});
const ack=(d,extra={})=>({create:{_index:d._index,_type:d._type,_id:d._id,status:201,result:'created',_version:1,...extra}});
const ids=body=>body.filter((_,i)=>i%2===0).map(line=>JSON.parse(line).create);
test('batch uses actual ES5 NDJSON serializer and each item receives its own acknowledgement',async()=>{
 const calls=[],writer=createEs5BulkWriter({maxItems:3,es:{bulk:async request=>{calls.push(request);return{items:ids(request.body).map(d=>ack(d))};}}});
 const results=await Promise.all(['1','2','3'].map(id=>writer.write(doc(id))));
 assert.equal(calls.length,1);assert.equal(calls[0].refresh,false);assert.deepEqual(results.map(r=>r._id),['1','2','3']);
 const client=new ES.Client({host:'http://127.0.0.1:9200',log:[]});
 const Serializer=(await import('elasticsearch/src/lib/serializers/json.js')).default;
 const wire=new Serializer().bulkBody(calls[0].body);
 assert.equal(wire.split('\n').length,7);assert.equal(wire.at(-1),'\n');assert.equal(JSON.parse(wire.split('\n')[1]).content,'text\nwith newline');client.close();
});
test('mixed bulk results reject only failed item and preserve exact ES error',async()=>{
 const esError={type:'mapper_parsing_exception',reason:'invalid date'};
 const writer=createEs5BulkWriter({maxItems:2,es:{bulk:async()=>({errors:true,items:[ack(doc('1')),ack(doc('2'),{status:400,error:esError})]})}});
 const results=await Promise.allSettled([writer.write(doc('1')),writer.write(doc('2'))]);
 assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(results[1].reason.code,'ES5_BULK_ITEM_FAILED');assert.deepEqual(results[1].reason.esError,esError);
});
test('missing/truncated/incorrect identity and unconfirmed results never acknowledge a job',async()=>{
 for(const response of [{},{items:[]},{items:[ack(doc('wrong'))]},...['_index','_type'].map(key=>({items:[ack({...doc('1'),[key]:'wrong'})]})),{items:[ack(doc('1'),{_version:0})]},{items:[ack(doc('1'),{result:'noop'})]},{items:[ack(doc('1'),{status:429})]}]){
  const writer=createEs5BulkWriter({maxItems:1,es:{bulk:async()=>response}});await assert.rejects(writer.write(doc('1')));
 }
});
test('transport failures reject all active tickets without retrying or acknowledging',async()=>{
 let calls=0;const writer=createEs5BulkWriter({maxItems:2,es:{bulk:async()=>{calls++;throw Error('OFFLINE');}}});
 const results=await Promise.allSettled([writer.write(doc('1')),writer.write(doc('2'))]);assert.equal(calls,1);for(const r of results){assert.equal(r.status,'rejected');assert.match(r.reason.message,/OFFLINE/);}
});
test('partial batches flush on bounded timer, byte limits split batches, oversize documents fail before sending',async()=>{
 const batches=[],writer=createEs5BulkWriter({maxBytes:160,flushMs:5,es:{bulk:async({body})=>{batches.push(body);return{items:ids(body).map(d=>ack(d))};}}});
 await Promise.all([writer.write(doc('1')),writer.write(doc('2'))]);assert.equal(batches.length,2);
 await assert.rejects(writer.write({...doc('3'),_source:{content:'x'.repeat(200)}}),/DOCUMENT_TOO_LARGE/);assert.equal(batches.length,2);
});
test('normal validation rejects bad author/date/parent/mapping before bulk; only successful ES item publishes target',async()=>{
 const source={platform:'youtube',type:'channel',_id:'youtube:channel:UCpublic',nativeId:'UCpublic'},item={type:'post',id:'abcdefghijk',url:'https://www.youtube.com/watch?v=abcdefghijk',author:{id:'UCpublic'},createdAt:'2026-10-29T10:00:00Z',text:'public',metrics:{comment:1}};
 const submitted=[],published=[];
 const writer=createEs5BulkWriter({maxItems:2,es:{bulk:async({body})=>{submitted.push(body);return{items:[ack(ids(body)[0]),ack(ids(body)[1],{status:400,error:{type:'mapper_parsing_exception'}})]};}}});
 for(const delta of [{createdAt:null},{author:{id:'wrong'}}])assert.throws(()=>serializeCrawlItem({...item,...delta},source));
 assert.throws(()=>serializeCrawlItem({...item,type:'comment',id:'UgxNative',postId:'wrong'},source,{parent:{systemId:item.id,nativeId:item.id,createdAt:item.createdAt,url:item.url}}),/COMMENT_PARENT_MISMATCH/);
 assert.throws(()=>verifyDocumentMapping(serializeCrawlItem(item,source),{properties:{}}),/ES5_UNMAPPED_FIELD/);assert.equal(submitted.length,0);
 const commit=i=>commitCrawlDocument({item:i,source,doc:serializeCrawlItem(i,source),write:d=>writer.write(d),upsertTarget:async t=>published.push(t)});
 const results=await Promise.allSettled([commit(item),commit({...item,id:'abcdefghij2'})]);assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(published.length,1);assert.equal(published[0].fields.esPostProof.id,item.id);
});
test('flushing in-flight work leaves later batch independent; telemetry errors do not affect confirmed results',async()=>{
 let release;const first=new Promise(r=>release=r);let calls=0;
 const writer=createEs5BulkWriter({maxItems:1,onBatch:()=>{throw Error('LOG');},es:{bulk:async({body})=>{if(++calls===1)await first;return{items:ids(body).map(d=>ack(d))};}}});
 const a=writer.write(doc('1'));assert.equal((await writer.write(doc('2')))._id,'2');release();assert.equal((await a)._id,'1');
});
test('backpressure caps concurrent HTTP requests and coalesces waiting rows without acknowledging them early',async()=>{
 const releases=[],calls=[];let active=0,peak=0;
 const writer=createEs5BulkWriter({maxItems:4,maxConcurrent:2,flushMs:5,es:{bulk:async({body})=>{
  calls.push(body);peak=Math.max(peak,++active);await new Promise(resolve=>releases.push(resolve));active--;return{items:ids(body).map(d=>ack(d))};
 }}});
 const first=writer.write(doc('1'));writer.flush();const second=writer.write(doc('2'));writer.flush();
 const later=['3','4','5','6','7','8','9','10'].map(id=>writer.write(doc(id)));let completed=false;
 const all=Promise.all([first,second,...later]).then(r=>{completed=true;return r;});
 await new Promise(r=>setTimeout(r,15));assert.equal(calls.length,2);assert.equal(completed,false);
 releases.shift()();await new Promise(r=>setImmediate(r));assert.equal(calls.length,3);assert.equal(ids(calls[2]).length,4);
 releases.shift()();await new Promise(r=>setImmediate(r));assert.equal(calls.length,4);assert.equal(ids(calls[3]).length,4);
 while(releases.length)releases.shift()();const result=await all;
 assert.equal(peak,2);assert.equal(result.length,10);assert.equal(new Set(result.map(r=>r._id)).size,10);
});
test('byte ceiling also holds when HTTP backpressure accumulates several batches',async()=>{
 const releases=[],batches=[];const writer=createEs5BulkWriter({maxItems:10,maxBytes:160,maxConcurrent:1,es:{bulk:async({body})=>{
  batches.push(body);await new Promise(r=>releases.push(r));return{items:ids(body).map(d=>ack(d))};
 }}});
 const promises=['1','2','3','4'].map(id=>writer.write(doc(id)));writer.flush();
 for(let i=0;i<4;i++){assert.equal(releases.length,1);releases.shift()();await new Promise(r=>setImmediate(r));}
 await Promise.all(promises);assert.equal(batches.length,4);
 for(const body of batches)assert.ok(Buffer.byteLength(body.join('\n')+'\n')<=160);
});

test('only rejected items retry under backpressure; confirmed siblings are never submitted again',async()=>{
 const calls=[],waits=[];let attempt=0;
 const writer=createEs5BulkWriter({maxItems:2,wait:async ms=>waits.push(ms),es:{bulk:async({body})=>{const docs=ids(body);calls.push(docs.map(d=>d._id));return{items:docs.map(d=>ack(d,d._id==='2'&&attempt++===0?{status:429,error:{type:'es_rejected_execution_exception'}}:{}))};}}});
 const r=await Promise.all([writer.write(doc('1')),writer.write(doc('2'))]);assert.deepEqual(calls,[['1','2'],['2']]);assert.deepEqual(waits,[250]);assert.deepEqual(r.map(x=>x._id),['1','2']);
});
test('temporary transport failure retries deterministic writes, exhaustion remains failed and publishes no target',async()=>{
 let calls=0;const writer=createEs5BulkWriter({maxItems:1,wait:async()=>{},es:{bulk:async({body})=>{if(++calls===1)throw Object.assign(Error('broken pipe'),{code:'EPIPE'});return{items:ids(body).map(d=>ack(d))};}}});assert.equal((await writer.write(doc('1')))._id,'1');assert.equal(calls,2);
 let attempts=0;const limited=createEs5BulkWriter({maxItems:1,retryLimit:2,wait:async()=>{},es:{bulk:async()=>{attempts++;return{items:[ack(doc('1'),{status:429,error:{type:'es_rejected_execution_exception'}})]};}}});await assert.rejects(limited.write(doc('1')),e=>e.esError?.type==='es_rejected_execution_exception');assert.equal(attempts,3);
});

test('create skips duplicate 409 once, retries only transient siblings and reports created/duplicate counts',async()=>{
 const calls=[],events=[],waits=[];const conflict={type:'version_conflict_engine_exception',reason:'document already exists'};
 const writer=createEs5BulkWriter({maxItems:3,wait:async ms=>waits.push(ms),onBatch:r=>events.push(r),es:{bulk:async({body})=>{const docs=ids(body);calls.push(docs.map(d=>d._id));for(let i=0;i<body.length;i+=2)assert.deepEqual(Object.keys(JSON.parse(body[i])),['create']);return{errors:calls.length===1,items:docs.map(d=>ack(d,calls.length===1&&d._id==='old'?{status:409,error:conflict}:calls.length===1&&d._id==='retry'?{status:429,error:{type:'es_rejected_execution_exception'}}:{}))};}}});
 const r=await Promise.all(['new','old','retry'].map(id=>writer.write(doc(id))));assert.deepEqual(calls,[['new','old','retry'],['retry']]);assert.equal(r[1].skipped,true);assert.equal(r[1].reason,'ES5_DOCUMENT_EXISTS');assert.deepEqual(waits,[250]);assert.equal(events[0].duplicates,1);assert.equal(events[0].created,2);assert.equal(events[0].failed,0);
});
test('duplicate create never publishes parent metadata, validates exact identity, and does not pretend to create',async()=>{
 const source={platform:'youtube',type:'channel',nativeId:'UCpublic'},item={id:'abcdefghijk',author:{id:'UCpublic'},createdAt:'2026-10-29T10:00:00Z',metrics:{comment:1}},d=serializeCrawlItem(item,source);let published=false,calls=0;
 const writer=createEs5BulkWriter({maxItems:1,es:{bulk:async()=>{calls++;return{items:[ack(d,{status:409,error:{type:'version_conflict_engine_exception'}})]};}}});
 const r=await commitCrawlDocument({doc:d,item,source,write:x=>writer.write(x),upsertTarget:async()=>published=true});assert.equal(r.skipped,true);assert.equal(r.reason,'ES5_DOCUMENT_EXISTS');assert.equal(published,false);assert.equal(calls,1);
 for(const delta of [{_id:'wrong'},{_type:'wrong'},{_index:'wrong'}]){const bad=createEs5BulkWriter({maxItems:1,es:{bulk:async()=>({items:[ack(d,{status:409,error:{type:'version_conflict_engine_exception'},...delta})]})}});await assert.rejects(bad.write(d),/IDENTITY_MISMATCH/);}
});
test('create rejects unexpected 409 and updated acknowledgements without retrying',async()=>{
 for(const extra of [{status:409,error:{type:'other_conflict'}},{status:200,result:'updated'}]){let calls=0;const writer=createEs5BulkWriter({maxItems:1,es:{bulk:async()=>{calls++;return{items:[ack(doc('1'),extra)]};}}});await assert.rejects(writer.write(doc('1')));assert.equal(calls,1);}
});
