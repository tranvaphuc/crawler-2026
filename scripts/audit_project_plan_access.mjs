import fs from 'node:fs/promises';
const root='outputs/project-sources-2026-10-21';const docs=JSON.parse(await fs.readFile(root+'/plans-manifest.json','utf8'));
const queue=docs.filter(x=>x.status!=='DOWNLOADED');
async function worker(){while(queue.length){const d=queue.shift();try{const r=await fetch(d.url,{signal:AbortSignal.timeout(20000)});const text=await r.text();d.accessCheckAt=new Date().toISOString();
if(/tệp mà bạn yêu cầu đã bị xóa|file you have requested has been deleted|file you requested has been deleted/i.test(text))d.status='DELETED_DOCUMENT';
else if(d.httpStatus===401){d.status='NO_ACCESS_WITH_KOMPA';d.access='authenticated Chrome export attempted with authuser=1';}
else d.status='DOCUMENT_UNAVAILABLE';
}catch{d.status='DOCUMENT_UNAVAILABLE';}}}
await Promise.all(Array.from({length:4},worker));await fs.writeFile(root+'/plans-manifest.json',JSON.stringify(docs,null,2));console.log(JSON.stringify(docs.reduce((a,d)=>(a[d.status]=(a[d.status]??0)+1,a),{})));
