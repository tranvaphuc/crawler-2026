import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {gzipSync} from 'node:zlib';import {BSON} from 'mongodb';import {readFailureBackup} from '../src/services/crawlerFailureBackup.js';
test('backup LF framing preserves Unicode line separators, multiline text and BSON dates',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'failure-backup-'));try{
  const rows=[{_id:'a',text:'Tiếng Việt\u2028giữ nguyên\u2029 và\r\nnewline',failedAt:new Date('2026-10-29T17:00:00Z')},{_id:'b',text:'𐐷'.repeat(40000),counter:BSON.Long.fromString('9007199254740993')}],file=path.join(dir,'backup.gz');
  await fs.writeFile(file,gzipSync(rows.map(r=>BSON.EJSON.stringify(r,{relaxed:false})).join('\n')+'\n'));const actual=[];for await(const row of readFailureBackup(file))actual.push(row);
  assert.equal(actual.length,2);assert.equal(actual[0].text,rows[0].text);assert.equal(+actual[0].failedAt,+rows[0].failedAt);assert.equal(actual[1].text,rows[1].text);assert.equal(actual[1].counter.toString(),'9007199254740993');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('malformed backup errors identify the record without exposing payload contents',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'failure-backup-'));try{const file=path.join(dir,'backup.gz');await fs.writeFile(file,gzipSync('{"_id":"a"}\n{"SECRET_PRIVATE_BODY"\n'));
  await assert.rejects(async()=>{for await(const row of readFailureBackup(file)){}},e=>{assert.match(e.message,/LINE_2/);assert.doesNotMatch(e.message,/SECRET/);return true;});
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
