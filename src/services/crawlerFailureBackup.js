import fs from 'node:fs';
import {createGunzip} from 'node:zlib';
import {BSON} from 'mongodb';
// Newer readline versions split Unicode U+2028/U+2029, which are valid *inside*
// JSON strings. JSONL records are framed only by literal LF bytes.
export async function* readFailureBackup(file){
 const input=fs.createReadStream(file).pipe(createGunzip());input.setEncoding('utf8');
 let pending='',lineNumber=0;
 const parse=line=>{lineNumber++;try{return BSON.EJSON.parse(line,{relaxed:false});}catch(e){throw Error('BACKUP_EJSON_PARSE_FAILED_LINE_'+lineNumber+'_'+e.name);}};
 for await(const chunk of input){
  pending+=chunk;let end;
  while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);if(line)yield parse(line);}
  if(pending.length>128*1024*1024)throw Error('BACKUP_RECORD_TOO_LARGE');
 }
 if(pending)yield parse(pending);
}
