import fs from 'node:fs';
import Redis from 'ioredis';
import {Queue} from 'bullmq';
const dir=process.env.LOCAL_UID_DIR||'outputs/local-uid-worker-2026-10-29';
const op=JSON.parse(fs.readFileSync(dir+'/latest-failed-retry.json'));
const manifest=JSON.parse(fs.readFileSync(op.manifest)),tickets=JSON.parse(fs.readFileSync(op.root+'/tickets.credentials.json'));
const c=JSON.parse(fs.readFileSync(dir+'/local-connection.credentials.json'));
const r=new Redis(c.redis,{maxRetriesPerRequest:1,commandTimeout:60000}),q=new Queue('crawler-flow-find-uid',{connection:r});
try{
 const known=new Set(manifest.ids),failed=await r.zrange(q.toKey('failed'),0,-1),extra=failed.filter(id=>!known.has(id)),added=[];
 for(let i=0;i<extra.length;i+=50){
  const ids=extra.slice(i,i+50),p=r.pipeline();for(const id of ids)p.hmget(q.toKey(id),'data','failedReason');
  const rows=await p.exec();for(let j=0;j<ids.length;j++){
   if(rows[j][0])throw rows[j][0];const [raw,reason]=rows[j][1];const data=raw?JSON.parse(raw):{};
   added.push({id:ids[j],failedReason:reason,data:{item:{id:data.item?.id,author:data.item?.author}}});
  }
 }
 if(added.length){
  const at=new Date().toISOString(),suffix='.before-delta-'+at.replace(/[:.]/g,'-');
  for(const file of [op.manifest,op.root+'/tickets.credentials.json']){fs.copyFileSync(file,file+suffix,fs.constants.COPYFILE_EXCL);fs.chmodSync(file+suffix,0o600);}
  const next={...manifest,ids:[...manifest.ids,...added.map(t=>t.id)],count:manifest.count+added.length,extendedAt:at,extensions:[...(manifest.extensions||[]),{at,added:added.length}]};
  fs.writeFileSync(op.root+'/tickets.credentials.json.tmp',JSON.stringify([...tickets,...added]),{mode:0o600});fs.renameSync(op.root+'/tickets.credentials.json.tmp',op.root+'/tickets.credentials.json');
  fs.writeFileSync(op.manifest+'.tmp',JSON.stringify(next),{mode:0o600});fs.renameSync(op.manifest+'.tmp',op.manifest);
  fs.writeFileSync(op.root+'/failed-job-ids.txt',next.ids.join('\n')+'\n',{mode:0o600});
 }
 console.log(JSON.stringify({at:new Date(),previousSnapshot:manifest.count,added:added.length,snapshot:manifest.count+added.length,currentFailed:failed.length}));
}finally{await q.close();await r.quit();}
