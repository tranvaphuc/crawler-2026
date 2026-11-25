import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const root = new URL('../outputs/source-audit-2026-10-22/', import.meta.url);
const cutoff = Date.parse(process.argv[2]);
if (!Number.isFinite(cutoff)) throw Error('Pass the current browser run start timestamp');
const queue = JSON.parse(await fs.readFile(new URL('facebook-browser-remaining.json', root),'utf8'));
const indices = new Set(queue.map(row=>row.index));
const downloads = path.join(os.homedir(),'Downloads');
const watchFile = new URL('browser-result-watcher.json',root);
try {
  const old = JSON.parse(await fs.readFile(watchFile,'utf8'));
  if (old.pid && old.status==='watching') {
    try {process.kill(old.pid,0);throw Error('A result watcher is already running');}
    catch(e) {if(e.code!=='ESRCH')throw e;}
  }
} catch(e) {if(e.code!=='ENOENT')throw e;}
const processed = new Set();
const collected = new Map();
const started = Date.now();
let lastChange = started;
let status = 'watching';
async function save() {
  await fs.writeFile(watchFile,JSON.stringify({pid:process.pid,status,startedAt:new Date(started).toISOString(),browserRunStartedAt:new Date(cutoff).toISOString(),updatedAt:new Date().toISOString(),expected:queue.length,checked:collected.size,live:[...collected.values()].filter(r=>r.status==='live').length,unknown:[...collected.values()].filter(r=>r.status==='chưa xác định').length},null,2));
}
await save();
while(Date.now()-started<8*3600_000) {
  let changed = false;
  for (const name of await fs.readdir(downloads)) {
    if(!/^facebook-browser-source-recheck(?: \(\d+\))?\.jsonl$/.test(name))continue;
    const file=path.join(downloads,name),stat=await fs.stat(file),fingerprint=name+':'+stat.size+':'+stat.mtimeMs;
    if(processed.has(fingerprint)||stat.mtimeMs<cutoff)continue;
    let rows;
    try {rows=(await fs.readFile(file,'utf8')).split('\n').filter(Boolean).map(JSON.parse);}
    catch {continue;}
    processed.add(fingerprint);
    if(!rows.length||rows.some(r=>!indices.has(r.index)||Date.parse(r.checkedAt)<cutoff))continue;
    const result=spawnSync(process.execPath,[new URL('./ingest_browser_source_recheck.mjs',import.meta.url).pathname,file],{encoding:'utf8'});
    if(result.status!==0) {console.log(JSON.stringify({rejectedCheckpoint:name}));continue;}
    for(const row of rows)collected.set(row.index,row);
    changed=true;
  }
  if(changed) {
    const merged=spawnSync(process.execPath,[new URL('./merge_browser_source_recheck.mjs',import.meta.url).pathname],{encoding:'utf8'});
    if(merged.status!==0)throw Error('Result merge failed');
    lastChange=Date.now();
    console.log(JSON.stringify({checked:collected.size,expected:queue.length,live:[...collected.values()].filter(r=>r.status==='live').length}));
  }
  if(collected.size===queue.length) {status='facebook-pass-saved';await save();break;}
  if(Date.now()-lastChange>3600_000) {status='no-new-checkpoint-for-one-hour';await save();break;}
  await save();
  await new Promise(resolve=>setTimeout(resolve,30_000));
}
if(status==='watching') {status='watch-time-limit';await save();}
