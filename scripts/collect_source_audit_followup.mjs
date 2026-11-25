import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=new URL('../outputs/source-audit-followup-2026-10-22/',import.meta.url);
const base=JSON.parse(await fs.readFile(new URL('sources-base.json',root),'utf8'));
const output=new URL('browser-updates.jsonl',root);
const seen=new Set((await fs.readFile(output,'utf8')).split('\n').filter(Boolean).map(line=>{const r=JSON.parse(line);return r.index+'|'+r.checkedAt;}));
const fileSignatures=new Map();
async function collect(){
 const names=(await fs.readdir(path.join(os.homedir(),'Downloads'))).filter(n=>/^(?:facebook-followup-recheck|source-followup-(?:threads|instagram|youtube))(?: \(\d+\))?\.jsonl$/.test(n));
 let added=0,rejected=0;
 for(const name of names){
  const file=path.join(os.homedir(),'Downloads',name),stat=await fs.stat(file),signature=stat.size+'|'+stat.mtimeMs;
  if(fileSignatures.get(file)===signature)continue;
  const content=await fs.readFile(file,'utf8');
  for(const line of content.split('\n').filter(Boolean)){
   let r;try{r=JSON.parse(line);}catch{rejected++;continue;}
   const b=base[r.index];
   if(!Number.isInteger(r.index)||!b||b.channel!==r.channel||b.originalLink!==r.originalLink||!Array.isArray(r.keys)||!r.keys.length||!r.keys.every(k=>(b.keys||[]).includes(k))||!['live','die','chưa xác định'].includes(r.status)||!r.checkedAt){rejected++;continue;}
   const key=r.index+'|'+r.checkedAt;if(seen.has(key))continue;
   const safe=Object.fromEntries(['index','keys','channel','originalLink','name','id','cid','placeId','url','type','status','note','checkedAt','identityEvidence'].filter(k=>Object.hasOwn(r,k)).map(k=>[k,r[k]]));
   await fs.appendFile(output,JSON.stringify(safe)+'\n');seen.add(key);added++;
  }
  fileSignatures.set(file,signature);
 }
 if(added)spawnSync(process.execPath,[new URL('source_audit_followup.mjs',import.meta.url).pathname],{stdio:'ignore'});
 const status={checkedAt:new Date().toISOString(),pid:process.pid,added,rejected,totalRecords:seen.size,watch:process.argv.includes('--watch')};
 await fs.writeFile(new URL('collector-status.json',root),JSON.stringify(status,null,2));
 console.log(JSON.stringify(status));
}
await collect();
if(process.argv.includes('--watch'))setInterval(()=>collect().catch(e=>console.error(e.message)),15000);
