import fs from 'node:fs/promises';
import {normalizeSource} from './source_audit_normalize.mjs';
const root='outputs/source-audit-additions-2026-10-22',follow='outputs/source-audit-followup-2026-10-22';
const raw=JSON.parse(await fs.readFile(root+'/sources-raw.json','utf8'));
const base=JSON.parse(await fs.readFile(follow+'/sources-base.json','utf8'));
const current=JSON.parse(await fs.readFile(follow+'/sources-current.json','utf8'));
const known=new Map(current.flatMap(r=>(r.keys||[]).map(k=>[k,r]))),pending=new Map(),references=[],associations=[];
const reports=/data monthly query|interaction monthly query|paid links|kols.?\s*seeding links|vf check|^link-id$|^top users kols$|^data$|^raw data$/i;
let excluded=0,existing=0;
for(const r of raw){
 if(reports.test(r.planSheet)){references.push(r);continue;}
 const s=normalizeSource(r.inputUrl,r.channel);if(!s){excluded++;continue;}
 let target=known.get(s.key)||pending.get(s.key);
 if(target){existing++;associations.push({key:s.key,inputUrl:r.inputUrl,project:r.project.trim(),origin:{planUrl:r.planUrl,sheet:r.planSheet,cell:r.cell}});if(pending.has(s.key)){for(const [field,value] of [['inputUrls',r.inputUrl],['projects',r.project.trim()]])if(!target[field].includes(value))target[field].push(value);target.origins.push({planUrl:r.planUrl,sheet:r.planSheet,cell:r.cell});}continue;}
 target={channel:s.channel,originalLink:r.inputUrl,name:r.sourceName||'',id:s.id||null,url:s.url,type:s.type||'',status:'chưa xác định',note:r.note||'',cid:null,placeId:null,inputUrls:[r.inputUrl],projects:[r.project.trim()],origins:[{planUrl:r.planUrl,sheet:r.planSheet,cell:r.cell}],keys:[s.key],identityEvidence:'',checkedAt:null};
 pending.set(s.key,target);
}
const added=[...pending.values()];
const queues=added.map((r,i)=>({index:base.length+i,channel:r.channel,keys:r.keys,originalLink:r.originalLink,url:r.url,name:r.name,id:r.id,note:r.note}));
await fs.writeFile(root+'/new-sources.json',JSON.stringify(added,null,2));
await fs.writeFile(root+'/report-references.json',JSON.stringify(references,null,2));
await fs.writeFile(root+'/existing-source-associations.json',JSON.stringify(associations,null,2));
await fs.writeFile(root+'/browser-new.json',JSON.stringify(queues,null,2));
for(const c of new Set(queues.map(r=>r.channel)))await fs.writeFile(root+'/'+c.toLowerCase()+'-new.json',JSON.stringify(queues.filter(r=>r.channel===c),null,2));
const summary={newPlans:JSON.parse(await fs.readFile(root+'/new-plans.json','utf8')).length,raw:raw.length,reportReferences:references.length,excluded,existingOrRepeated:existing,additionalSources:added.length,channels:Object.fromEntries([...new Set(added.map(r=>r.channel))].map(c=>[c,added.filter(r=>r.channel===c).length])),baseRowsBefore:base.length};
await fs.writeFile(root+'/summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));
