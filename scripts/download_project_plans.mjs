import fs from 'node:fs/promises';
import {join} from 'node:path';
const out='outputs/project-sources-2026-10-21';
const projects=JSON.parse(await fs.readFile(join(out,'projects.json'),'utf8'));
const docs=new Map();
for(const p of projects)for(const url of p.url.match(/https?:\/\/[^\s]+/g)??[]){
 const m=url.match(/(?:spreadsheets\/d|file\/d)\/([\w-]+)/);if(!m)continue;
 if(!docs.has(m[1]))docs.set(m[1],{id:m[1],url,kind:url.includes('/spreadsheets/')?'sheet':'drive',projects:[]});
 docs.get(m[1]).projects.push(p);
}
await fs.mkdir(join(out,'plans'),{recursive:true});
let queue=[...docs.values()],done=0;
async function worker(){while(queue.length){const d=queue.shift();const path=join(out,'plans',d.id+'.xlsx');
 try{await fs.access(path);d.status='DOWNLOADED';d.file=path;}
 catch{if(d.kind!=='sheet'){d.status='DRIVE_REQUIRES_BROWSER';continue;}
 try{const res=await fetch(`https://docs.google.com/spreadsheets/d/${d.id}/export?format=xlsx`,{signal:AbortSignal.timeout(60000)});const body=Buffer.from(await res.arrayBuffer());
 if(!res.ok||body[0]!==0x50||body[1]!==0x4b){d.status='ACCESS_OR_EXPORT_ERROR';d.httpStatus=res.status;}
 else{await fs.writeFile(path,body);d.file=path;d.status='DOWNLOADED';}}
 catch(e){d.status='DOWNLOAD_ERROR';d.error=e.name;}}
 done++;if(done%10===0)console.log(JSON.stringify({done,total:docs.size,downloaded:[...docs.values()].filter(x=>x.status==='DOWNLOADED').length}));
 await fs.writeFile(join(out,'plans-manifest.json'),JSON.stringify([...docs.values()],null,2));
}}
await Promise.all(Array.from({length:4},worker));
await fs.writeFile(join(out,'plans-manifest.json'),JSON.stringify([...docs.values()],null,2));
console.log(JSON.stringify([...docs.values()].reduce((a,d)=>(a[d.status]=(a[d.status]??0)+1,a),{})));
