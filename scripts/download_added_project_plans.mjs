import fs from 'node:fs/promises';
const root='outputs/source-audit-additions-2026-10-22';
const docs=JSON.parse(await fs.readFile(root+'/new-plans.json','utf8'));
await fs.mkdir(root+'/plans',{recursive:true});
let queue=[...docs];
async function worker(){while(queue.length){const d=queue.shift();d.file=root+'/plans/'+d.id+'.xlsx';try{await fs.access(d.file);d.status='DOWNLOADED';}catch{try{const r=await fetch(`https://docs.google.com/spreadsheets/d/${d.id}/export?format=xlsx`,{signal:AbortSignal.timeout(30000)});const b=Buffer.from(await r.arrayBuffer());if(r.ok&&b[0]===80&&b[1]===75){await fs.writeFile(d.file,b);d.status='DOWNLOADED';}else{d.status='BROWSER_REQUIRED';d.httpStatus=r.status;}}catch(e){d.status='BROWSER_REQUIRED';d.error=e.name;}}console.log(JSON.stringify({id:d.id,status:d.status}));}}
await Promise.all(Array.from({length:3},worker));
await fs.writeFile(root+'/plans-manifest.json',JSON.stringify(docs,null,2));
