import fs from 'node:fs/promises';
import {normalizeSource} from './source_audit_normalize.mjs';
const old='outputs/project-sources-2026-10-21',out='outputs/source-audit-2026-10-22';await fs.mkdir(out,{recursive:true});
const raw=JSON.parse(await fs.readFile(old+'/sources-raw.json','utf8'));
const urls=new Map();for(const r of raw){let a=urls.get(r.inputUrl);if(!a){a={url:r.inputUrl,hint:r.channel,names:new Set(),projects:new Set(),origins:[]};urls.set(r.inputUrl,a);}if(r.sourceName&&r.sourceName.length<200)a.names.add(r.sourceName);a.projects.add(r.project);if(a.origins.length<10)a.origins.push({project:r.project,planUrl:r.planUrl,sheet:r.planSheet,cell:r.cell});}
// Retain the explicitly supplied identity examples as part of this audit.
for(const [url,hint] of [['https://www.facebook.com/656342367724454_1289415566559038','Facebook'],['https://www.threads.com/@hapas.vn','Threads'],['https://www.instagram.com/hapas.vn','Instagram'],['https://www.linkedin.com/company/tamduc-cardiology-hospital','LinkedIn']])if(!urls.has(url))urls.set(url,{url,hint,names:new Set(),projects:new Set(),origins:[]});
const sources=new Map(),mapping=[];let converted=0,skipped=0;
for(const a of urls.values()){
 const s=normalizeSource(a.url,a.hint);if(!s){skipped++;continue;}if(s.conversion)converted++;
 let r=sources.get(s.key);if(!r){r={...s,inputUrls:[],listedNames:[],projects:[],origins:[]};sources.set(s.key,r);}
 r.inputUrls.push(a.url);for(const n of a.names)if(!r.listedNames.includes(n))r.listedNames.push(n);for(const n of a.projects)if(!r.projects.includes(n))r.projects.push(n);if(r.origins.length<10)r.origins.push(...a.origins.slice(0,10-r.origins.length));
 mapping.push({inputUrl:a.url,key:s.key,sourceUrl:s.url,conversion:s.conversion||''});
}
await fs.writeFile(out+'/targets.json',JSON.stringify([...sources.values()]));await fs.writeFile(out+'/link-mapping.json',JSON.stringify(mapping));
console.log(JSON.stringify({rawRecords:raw.length,inputUrls:urls.size,normalizedSources:sources.size,converted,skipped,channels:[...sources.values()].reduce((a,x)=>(a[x.channel]=(a[x.channel]||0)+1,a),{})}));
