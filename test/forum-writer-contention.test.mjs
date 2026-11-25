import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {flushForumWriterWithContention} from '../src/forumFlow/writerContention.mjs';
test('a real SQLite lock retries the normal confirmation path after an ES create',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'forum-contention-'));const file=path.join(directory,'state.sqlite'),db=new DatabaseSync(file),other=new DatabaseSync(file);let created=0,lookups=0,exists=false,retries=0;
 try{db.exec('PRAGMA busy_timeout=0;CREATE TABLE receipts(id TEXT PRIMARY KEY)');
 const result=await flushForumWriterWithContention(async()=>{lookups++;if(!exists){exists=true;created++;other.exec('BEGIN IMMEDIATE');}db.prepare('INSERT OR IGNORE INTO receipts VALUES(?)').run('post');return 'confirmed';},{canRetry:()=>true,onRetry:()=>retries++,sleep:async()=>other.exec('ROLLBACK')});
 assert.equal(result,'confirmed');assert.equal(created,1);assert.equal(lookups,2);assert.equal(retries,1);assert.equal(db.prepare('SELECT count(*) n FROM receipts').get().n,1);
 }finally{db.close();other.close();await fs.rm(directory,{recursive:true,force:true});}
});
test('cannot retry when the writer stops, loses its lease, or encounters a non-lock SQLite failure',async()=>{
 for(const error of [Object.assign(Error('disk failure'),{errcode:10}),Object.assign(Error('constraint failure'),{errcode:19}),Error('FORUM_WRITER_LEASE_LOST')])await assert.rejects(flushForumWriterWithContention(()=>{throw error;},{canRetry:()=>true,sleep:async()=>{throw Error('unexpected retry');}}),e=>e===error);
 const busy=Object.assign(Error('locked'),{errcode:5});let calls=0;
 await assert.rejects(flushForumWriterWithContention(()=>{calls++;throw busy;},{canRetry:()=>false}),e=>e===busy);assert.equal(calls,1);
 let live=true;calls=0;await assert.rejects(flushForumWriterWithContention(()=>{calls++;throw busy;},{canRetry:()=>live,sleep:async()=>{live=false;}}),e=>e===busy);assert.equal(calls,1);
});
