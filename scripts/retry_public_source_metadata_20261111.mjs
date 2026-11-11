import fs from 'node:fs/promises';
import {fetchPage,parseMetadata} from './source_audit_metadata.mjs';
const dir='outputs/project-refresh-2026-11-10/completion';
const rows=JSON.parse(await fs.readFile(dir+'/retry-supported-sources.json','utf8'));
const results=await Promise.all(rows.map(async r=>{try{
 const p=await fetchPage(r.url,{timeout:25000,maxBytes:6500000});
 const m=parseMetadata({channel:{facebook:'Facebook',youtube:'YouTube',instagram:'Instagram'}[r.platform],url:r.url,type:r.type,id:r.id},p);
 const file=dir+'/retry-response-'+r._id.split(':').at(-1)+'.html';
 await fs.writeFile(file,p.body);
 return {_id:r._id,platform:r.platform,...m,httpStatus:p.status,responseFile:file,responseBytes:Buffer.byteLength(p.body),checkedAt:new Date().toISOString()};
}catch(e){return {_id:r._id,platform:r.platform,reason:e.code||e.name};}}));
await fs.writeFile(dir+'/retry-public-results.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
