import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {exportForumDocuments} from '../src/forumFlow/documentExport.mjs';

test('streams a sorted complete snapshot with the original document/proof format',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'forum-export-')),file=path.join(dir,'documents.jsonl'),db=new DatabaseSync(':memory:');
 try{db.exec('CREATE TABLE forum_documents(site,role,native_id,doc,proof)');const insert=db.prepare('INSERT INTO forum_documents VALUES(?,?,?,?,?)');
 for(let i=500;i>=0;i--)insert.run('site','forumComment',String(i).padStart(4,'0'),JSON.stringify({id:i,content:'nội dung '.repeat(1000)}),JSON.stringify({verified:true}));
 assert.equal(await exportForumDocuments(db,file),501);const rows=(await readFile(file,'utf8')).trimEnd().split('\n').map(JSON.parse);assert.equal(rows.length,501);assert.equal(rows[0].document.id,0);assert.equal(rows[500].document.id,500);assert.deepEqual(rows[0].proof,{verified:true});assert.deepEqual(await readdir(dir),['documents.jsonl']);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('a failed serialization retains the previous complete export and removes its temporary file',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'forum-export-')),file=path.join(dir,'documents.jsonl'),db=new DatabaseSync(':memory:');
 try{db.exec('CREATE TABLE forum_documents(site,role,native_id,doc,proof)');db.prepare('INSERT INTO forum_documents VALUES(?,?,?,?,?)').run('site','forumComment','1','invalid','{}');await writeFile(file,'previous complete export\n');await assert.rejects(exportForumDocuments(db,file),SyntaxError);assert.equal(await readFile(file,'utf8'),'previous complete export\n');assert.deepEqual(await readdir(dir),['documents.jsonl']);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
