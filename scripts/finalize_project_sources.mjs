import fs from 'node:fs/promises';
const root='outputs/project-sources-2026-10-21';
const inventory=JSON.parse(await fs.readFile(root+'/source-inventory.json','utf8'));
const references=JSON.parse(await fs.readFile(root+'/source-references.json','utf8'));
const resolved=new Map();for(const line of(await fs.readFile(root+'/facebook-resolved.jsonl','utf8')).split('\n').filter(Boolean)){const r=JSON.parse(line);resolved.set(r.key,r);}
const accessOverrides=JSON.parse(await fs.readFile(root+'/source-access-overrides.json','utf8').catch(e=>{if(e.code==='ENOENT')return '{}';throw e;}));
for(const r of resolved.values()){
 if(r.routeName==='comet.fbweb.CometProfileLoggedOutRoute'&&r.profileId){r.type='user';r.id=r.profileId;r.status='RESOLVED';r.evidencePath='rootView.props.userID';}
 if(r.name)r.name=r.name.replace(/\s*\(@[^)]+\)\s*•\s*Facebook.*$/i,'').replace(/\s*\|\s*Facebook$/i,'');
}
const byProfile=new Map(),byId=new Map();
for(const r of resolved.values())if(r.status==='RESOLVED'&&r.id){if(r.profileId)byProfile.set(r.profileId,r);byId.set(r.type+':'+r.id,r);}
const output=new Map();
function listedName(s){const n=(s.sourceName||'').trim();if(n.length>250||/^(main|sub|link fanpage|link|shipper|ship)$/i.test(n)||/siteName:|\bAND\b.*\bOR\b/.test(n))return '';return n;}
for(const s of inventory){
 let r=s.sourceKey?resolved.get(s.sourceKey)||resolved.get(s.sourceKey.replace(/\\+$/,'')):null;
 const access=accessOverrides[s.sourceKey];
 if(access&&r)r={...r,status:access.status};
 if(r&&r.status!=='RESOLVED'){
  const alias=r.profileId&&byProfile.get(r.profileId)||r.numericId&&(byProfile.get(r.numericId)||byId.get((r.typeHint==='group'?'group':'page')+':'+r.numericId));
  if(alias)r={...r,...alias,key:r.key,status:'RESOLVED_ALIAS'};
 }
 const actual=!!r&&['RESOLVED','RESOLVED_ALIAS'].includes(r.status);
 const row={...s,name:actual?r.name:r?.name||listedName(s),id:actual?r.id:r?.typeHint==='group'?r.numericId??null:null,
  type:actual?r.type:s.channel==='Facebook'?(r?.typeHint==='group'?'group':null):s.channel==='YouTube'?'channel':s.channel==='Forum'?'forum':s.channel==='News'?'news':s.channel==='Website'?'website':'profile',
  url:actual?r.url:s.url,profileId:r?.profileId??null,status:r?.status??s.status,nameEvidence:actual?'FACEBOOK':'PLAN',
  idEvidence:actual?r.evidencePath:r?.typeHint==='group'&&r.numericId?'URL_ONLY':'',
  inputUrl:s.url,sourceName:s.sourceName,accessEvidence:access?.evidence??'',accessNote:access?.note??''};
 if(s.channel==='YouTube'){const m=row.url.match(/\/channel\/(UC[\w-]+)/);if(m){row.id=m[1];row.idEvidence='URL_ONLY';}}
 row.note=[...new Set([s.note,...s.origins.map(x=>x.note),access?.note].filter(Boolean))].join(' | ');
 const key=row.project+'|'+row.channel+'|'+(actual?row.type+':'+row.id:row.url.toLowerCase());
 if(output.has(key)){
  const p=output.get(key);p.origins.push(...row.origins.filter(o=>!p.origins.some(x=>x.planUrl===o.planUrl&&x.sheet===o.sheet&&x.cell===o.cell)));
  p.note=[...new Set([p.note,row.note].filter(Boolean))].join(' | ');
 }else output.set(key,row);
}
const rows=[...output.values()].sort((a,b)=>a.channel.localeCompare(b.channel)||a.project.localeCompare(b.project)||a.name.localeCompare(b.name));
await fs.writeFile(root+'/sources.json',JSON.stringify(rows));
const unique=new Map();for(const r of rows){const k=r.channel+'|'+(r.id&&/RESOLVED/.test(r.status)?r.type+':'+r.id:r.url.toLowerCase());if(!unique.has(k))unique.set(k,{name:r.name,id:r.id,type:r.type,url:r.url,profileId:r.profileId,channel:r.channel,status:r.status,projects:[],notes:[]});const u=unique.get(k);if(!u.projects.includes(r.project))u.projects.push(r.project);if(r.note&&!u.notes.includes(r.note))u.notes.push(r.note);}
await fs.writeFile(root+'/sources-unique.json',JSON.stringify([...unique.values()]));
const summary={sourceRows:rows.length,uniqueSources:unique.size,referenceRows:references.length,
 channels:rows.reduce((a,x)=>(a[x.channel]=(a[x.channel]??0)+1,a),{}),
 facebook:rows.filter(x=>x.channel==='Facebook').reduce((a,x)=>(a[x.status]=(a[x.status]??0)+1,a),{}),
 uniqueFacebook:[...unique.values()].filter(x=>x.channel==='Facebook').length,
 resolvedUniqueFacebook:[...unique.values()].filter(x=>x.channel==='Facebook'&&/RESOLVED/.test(x.status)).length,
 facebookTypes:rows.filter(x=>x.channel==='Facebook'&&/RESOLVED/.test(x.status)).reduce((a,x)=>(a[x.type]=(a[x.type]??0)+1,a),{})};
await fs.writeFile(root+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
