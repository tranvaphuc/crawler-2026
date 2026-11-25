import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createSourceConcurrencySettings,sourceSliceExpired,yieldSourceSlice} from '../src/services/sourceRuntimePolicy.js';
import {packState,unpackState} from '../src/services/crawlerQueueFlow.js';import {ProxyWaitDelayedError} from '../src/services/crawlerProxyWait.js';
test('live source tuning never changes comments/import and rejects malformed or excessive budgets',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'source-concurrency-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'settings.json'),settings=createSourceConcurrencySettings({file});
 fs.writeFileSync(file,JSON.stringify({queues:{'facebook-group-source':160}}));settings.reload();assert.equal(settings.get({name:'facebook-group-source',kind:'source',workers:60}),160);assert.equal(settings.get({name:'facebook-comment',kind:'comments',workers:150}),150);
 for(const bad of [{'facebook-comment':1},{'facebook-group-source':0},{'facebook-group-source':301},{'facebook-group-source':300,'facebook-page-source':150}]){fs.writeFileSync(file,JSON.stringify({queues:bad}));settings.reload();assert.equal(settings.get({name:'facebook-group-source',kind:'source',workers:60}),160);}
});
test('source slices yield without consuming retry attempts or losing exact native cursors and pending rows',async()=>{
 const checkpoint=packState({nativeCursor:'exact-next',items:[{id:'not-yet-offered'}],seen:new Set(['seen'])}),data={kind:'source',checkpoint,proxyRetries:17,sourceRoundId:'same-round',pendingPage:{items:[{id:'durable-row'}]}};
 assert.equal(sourceSliceExpired(data,0,60000),true);assert.equal(sourceSliceExpired({kind:'comments'},0,100000),false);
 const calls=[],job={id:'same-ticket',data,updateData:async()=>calls.push('bull'),moveToDelayed:async(until,token)=>calls.push([until,token])},jobs={updateOne:async(_id,update)=>calls.push(update)};
 await assert.rejects(yieldSourceSlice({job,token:'same-lock',jobs,now:100000}),ProxyWaitDelayedError);assert.equal(data.proxyRetries,17);assert.equal(data.sourceRoundId,'same-round');assert.equal(unpackState(data.checkpoint).nativeCursor,'exact-next');assert.equal(data.pendingPage.items[0].id,'durable-row');assert.equal(data.sourceSlices,1);assert.deepEqual(calls.at(-1),[101000,'same-lock']);
});
