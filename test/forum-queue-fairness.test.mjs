import test from 'node:test';
import assert from 'node:assert/strict';
import {ForumState} from '../src/forumFlow/state.mjs';

test('repeated failures and incomplete comments cannot starve unattempted topics',async()=>{
 const s=await ForumState.open(':memory:');
 try{
  for(const id of ['1','2','3'])s.enqueue('forum.test','https://forum.test/threads/topic.'+id,id);
  s.db.prepare('UPDATE forum_urls SET seen=CAST(native_id AS INTEGER)').run();
  const first=s.ready('forum.test',1)[0];
  s.status(first,0,'DOWNLOAD_not_found',null,0);
  assert.equal(s.ready('forum.test',1)[0].native_id,'2');
  s.status(s.ready('forum.test',1)[0],0,'page_limit_resume','https://forum.test/threads/topic.2/page-9',0);
  assert.equal(s.ready('forum.test',1)[0].native_id,'3');
 }finally{s.close();}
});

test('due retries rotate by next due time and preserve their pagination checkpoints',async()=>{
 const s=await ForumState.open(':memory:');
 try{
  for(const id of ['1','2'])s.enqueue('forum.test','https://forum.test/threads/topic.'+id,id);
  s.db.prepare("UPDATE forum_urls SET next_at=1,resume_url=url||'/page-8' WHERE native_id='1'").run();
  s.db.prepare("UPDATE forum_urls SET next_at=2 WHERE native_id='2'").run();
  const first=s.ready('forum.test',1)[0];
  assert.equal(first.native_id,'1');
  s.status(first,0,'DOWNLOAD_access_blocked',first.resume_url,0);
  assert.equal(s.ready('forum.test',1)[0].native_id,'2');
  assert.equal(s.db.prepare("SELECT resume_url FROM forum_urls WHERE native_id='1'").get().resume_url,first.resume_url);
 }finally{s.close();}
});
