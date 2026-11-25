import {createWriteStream} from 'node:fs';
import {rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

// Keep the last complete export when interrupted, and bound memory by streaming.
export async function exportForumDocuments(db,file){
 const temporary=file+'.'+randomUUID()+'.tmp',statement=db.prepare('SELECT doc,proof FROM forum_documents ORDER BY site,role,native_id');let count=0;
 function* lines(){
  for(const row of statement.iterate()){
   count++;yield JSON.stringify({document:JSON.parse(row.doc),proof:JSON.parse(row.proof)})+'\n';
  }
  if(!count)yield '\n';
 }
 try{
  await pipeline(Readable.from(lines()),createWriteStream(temporary,{flags:'wx',mode:0o600}));
  await rename(temporary,file);return count;
 }catch(error){await unlink(temporary).catch(()=>{});throw error;}
}
