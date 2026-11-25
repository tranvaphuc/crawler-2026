import fs from 'node:fs/promises';
import {normalizeFacebookSource} from './facebook_source_resolver.mjs';
const root='outputs/project-sources-2026-10-21';
const rows=JSON.parse(await fs.readFile(root+'/sources-raw.json','utf8'));
// Curated source/configuration tabs and raw analytical reports remain separate.
const report=/data monthly query|interaction monthly query|paid links|kols.?\s*seeding links|vf check|^link-id$|^top users kols$|^data$|^raw data$/i;
const sources=new Map(),refs=new Map();
function canonical(url){try{const u=new URL(url);u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^__|^fbclid$/.test(k))u.searchParams.delete(k);return u.toString().replace(/\/$/,'');}catch{return url;}}
for(const row of rows){
 const fb=row.channel==='Facebook'?normalizeFacebookSource(row.inputUrl):null;
 const internal=/^https?:\/\/(?:cms\.[^/]+|[^/]+\/(?:dashboard\/projects|kibana)(?:\/|\?))/i.test(row.inputUrl);
 const reference=internal||report.test(row.planSheet)||fb&&fb.status!=='SOURCE';
 const url=fb?.status==='SOURCE'?fb.url:canonical(row.inputUrl);
 const key=row.project+'|'+row.channel+'|'+url;
 const target=reference?refs:sources;
 let r=target.get(key);
 if(!r){r={channel:row.channel,name:row.sourceName,id:null,type:fb?.typeHint==='group'?'group':null,url,profileId:null,
  project:row.project,projectIds:row.projectIds,projectStatus:row.projectStatus,projectNote:row.projectNote,
  sourceName:row.sourceName,channelNote:row.channelNote,note:row.note,origins:[],status:fb?'PENDING':'AS_LISTED',
  sourceKey:fb?.status==='SOURCE'?fb.key:null,referenceReason:reference?(internal?'INTERNAL_PROJECT_LINK':report.test(row.planSheet)?'REPORT_DATA':fb.status):null};target.set(key,r);}
 if(!r.name&&row.sourceName)r.name=row.sourceName;
 const origin={planUrl:row.planUrl,sheet:row.planSheet,cell:row.cell,note:row.note,channelNote:row.channelNote,sheetState:row.sheetState};
 if(!r.origins.some(x=>x.planUrl===origin.planUrl&&x.sheet===origin.sheet&&x.cell===origin.cell))r.origins.push(origin);
}
const inventory=[...sources.values()],references=[...refs.values()];
await fs.writeFile(root+'/source-inventory.json',JSON.stringify(inventory));
await fs.writeFile(root+'/source-references.json',JSON.stringify(references));
const unique=new Map();for(const s of inventory.filter(s=>s.channel==='Facebook')){if(!unique.has(s.sourceKey))unique.set(s.sourceKey,{...normalizeFacebookSource(s.url),listedNames:[],listedTypes:[]});const r=unique.get(s.sourceKey);if(s.name&&!r.listedNames.includes(s.name))r.listedNames.push(s.name);if(s.channelNote&&!r.listedTypes.includes(s.channelNote))r.listedTypes.push(s.channelNote);}
await fs.writeFile(root+'/facebook-targets.json',JSON.stringify([...unique.values()],null,2));
console.log(JSON.stringify({sourceRows:inventory.length,references:references.length,uniqueFacebook:unique.size,channels:inventory.reduce((a,x)=>(a[x.channel]=(a[x.channel]??0)+1,a),{})}));
