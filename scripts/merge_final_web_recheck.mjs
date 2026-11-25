import fs from 'node:fs/promises';
const root='outputs/source-audit-final-recheck-2026-10-22/',follow='outputs/source-audit-followup-2026-10-22/';
const base=JSON.parse(await fs.readFile(follow+'sources-base.json','utf8'));
const byKey=new Map(base.flatMap((r,index)=>r.keys.map(k=>[k,{...r,index}])));
const records=(await fs.readFile(root+'web-browser-results.jsonl','utf8')).split('\n').filter(Boolean).map(JSON.parse);
const seen=new Set((await fs.readFile(follow+'browser-updates.jsonl','utf8')).split('\n').filter(Boolean).map(l=>{const r=JSON.parse(l);return r.index+'|'+r.checkedAt;}));
let added=0;
for(const r of records){
 for(const key of r.keys){const b=byKey.get(key);if(!b)continue;const stamp=b.index+'|'+r.browserCheckedAt;if(seen.has(stamp))continue;
  const update={index:b.index,channel:b.channel,keys:[key],originalLink:b.originalLink,status:r.status,note:r.note,checkedAt:r.browserCheckedAt,identityEvidence:r.identityEvidence};
  await fs.appendFile(follow+'browser-updates.jsonl',JSON.stringify(update)+'\n');seen.add(stamp);added++;
 }
}
const counts=records.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{});
await fs.writeFile(root+'web-progress.json',JSON.stringify({updatedAt:new Date().toISOString(),checked:records.length,total:JSON.parse(await fs.readFile(root+'web.json','utf8')).length,counts},null,2));
console.log(JSON.stringify({added,checked:records.length,counts}));
