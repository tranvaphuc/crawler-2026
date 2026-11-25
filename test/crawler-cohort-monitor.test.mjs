import test from 'node:test';import assert from 'node:assert/strict';import {classifyCohort} from '../scripts/crawler_cohort_monitor.mjs';
test('cohort excludes new arrivals and keeps completion proof even if the same deterministic ID is reused',()=>{
 const r=classifyCohort([{id:'a',initialState:'waiting'},{id:'b',initialState:'active'}],new Map([['a','waiting'],['b','failed'],['new','active']]),{a:{state:'completed'}});
 assert.equal(r.total,2);assert.equal(r.completed,1);assert.equal(r.failed,1);assert.equal(r.pending,0);assert.equal(r.finished,true);
});
test('absence is not proof of success; pending Mongo work remains pending; explicit removal remains unconfirmed',()=>{
 const jobs=['missing','outbox','removed','old-failure'].map(id=>({id,initialState:id==='old-failure'?'failed':'waiting'}));
 const r=classifyCohort(jobs,new Map(),{removed:{state:'removed'}},new Map([['outbox','queued']]));
 assert.equal(r.unknown,1);assert.equal(r.pending,1);assert.equal(r.removedUnconfirmed,1);assert.equal(r.failed,1);assert.equal(r.completed,0);assert.equal(r.finished,false);
});
