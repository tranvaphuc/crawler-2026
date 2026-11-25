import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ForumState} from '../src/forumFlow/state.mjs';
import {claimForumWriterLease,renewForumWriterLease} from '../src/forumFlow/writerLease.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

test('heartbeat only renews a live lease owned by this writer',async()=>{
 const state=await ForumState.open(':memory:');
 try{
  state.db.exec('CREATE TABLE forum_writer_lease(id INTEGER PRIMARY KEY,owner TEXT,expires INTEGER)');
  const now=Date.now();claimForumWriterLease(state,'first',now);
  assert.equal(renewForumWriterLease(state,'first',now+120000,now+1000).expires,now+121000);
  assert.throws(()=>renewForumWriterLease(state,'other',now+120000,now+1000),/LEASE_LOST/);
  assert.throws(()=>renewForumWriterLease(state,'first',now+121000,now+121000),/LEASE_LOST/);
  assert.equal(state.db.prepare('SELECT owner FROM forum_writer_lease').get().owner,'first');
 }finally{state.close();}
});

test('SQLite contention retries within the confirmed lease; other errors fail',()=>{
 const now=Date.now();let failure=Object.assign(Error('database is locked'),{code:'ERR_SQLITE_ERROR',errcode:5});
 const state={db:{prepare:()=>({run:()=>{throw failure;}})}};
 assert.deepEqual(renewForumWriterLease(state,'one',now+120000,now),{expires:now+120000,retry:true});
 assert.throws(()=>renewForumWriterLease(state,'one',now,now),/LEASE_LOST/);
 failure=Object.assign(Error('disk error'),{errcode:10});
 assert.throws(()=>renewForumWriterLease(state,'one',now+120000,now),/disk error/);
});

test('a real competing SQLite transaction cannot silently end the writer lease',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'forum-lease-'));
 const state=await ForumState.open(path.join(directory,'state.sqlite'));
 let competing;
 try{
  state.db.exec('CREATE TABLE forum_writer_lease(id INTEGER PRIMARY KEY,owner TEXT,expires INTEGER);PRAGMA busy_timeout=0');
  const now=Date.now();claimForumWriterLease(state,'one',now);
  competing=new DatabaseSync(path.join(directory,'state.sqlite'));competing.exec('BEGIN IMMEDIATE');
  assert.equal(renewForumWriterLease(state,'one',now+120000).retry,true);
  competing.exec('ROLLBACK');
  assert.equal(renewForumWriterLease(state,'one',now+120000).retry,false);
 }finally{competing?.close();state.close();await fs.rm(directory,{recursive:true,force:true});}
});
