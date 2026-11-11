import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import {normalizeSource} from './source_audit_normalize.mjs';
const root='outputs/project-refresh-2026-11-10',read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const rows=await read(root+'/sources-normalized.json'),before=await read(root+'/system-sources-before.json'),audit=await read('outputs/source-audit-followup-2026-10-22/sources-current.json');
const clean=u=>{try{return normalizeSource(u)?.url?.replace(/\/$/,'').toLowerCase();}catch{return null;}};
const existing=new Map(),identities=new Map();
for(const r of before){existing.set(r._id,r);for(const u of [r.url,...r.originalLinks||[]])if(u)existing.set(clean(u),r);}
for(const r of audit)for(const u of [r.url,r.originalLink,...r.inputUrls||[]])if(u&&r.id)identities.set(clean(u),r);
const additions=[],associations=[],catalog=[];
for(const r of rows){
 const a=identities.get(clean(r.url)),platform=r.channel.toLowerCase(),type=a?.type||r.type||'unknown',id=a?.id||r.id||null;
 const key=platform+':'+type+':'+(id||createHash('sha256').update(r.url).digest('hex').slice(0,24));
 const known=existing.get(clean(r.url))||existing.get(key);
 const enabled=['facebook','instagram','threads','youtube'].includes(platform)&&a?.status==='live'&&id&&type!=='unknown';
 const row={_id:known?known._id:key,platform,type,nativeId:id,name:a?.name||r.name||'',url:a?.url||r.url,projects:r.projects,projectIds:r.projectIds,originalLinks:r.originalLinks,
  audit:{status:a?.status||'PLAN_ONLY',identityEvidence:a?.identityEvidence||null,checkedAt:a?.checkedAt||null,note:'Monitoring plan refresh 2026-11-10; provenance in project_source_inventory'},
  eligible:!!enabled,blockedReason:enabled?null:!['facebook','instagram','threads','youtube'].includes(platform)?'SOURCE_PLATFORM_NOT_OWNED_BY_FLOW_WORKERS':'SOURCE_NOT_YET_VERIFIED',origins:r.origins,refreshBatch:'project-refresh-2026-11-10'};
 catalog.push({...row,existing:!!known});
 if(known){const ps=r.projects.filter(x=>!known.projects?.includes(x));if(ps.length)associations.push({_id:known._id,projects:ps,originalLinks:r.originalLinks});}
 else {additions.push(row);existing.set(key,row);existing.set(clean(row.url),row);}
}
await fs.writeFile(root+'/sources-to-add.json',JSON.stringify(additions,null,2));await fs.writeFile(root+'/source-associations-to-add.json',JSON.stringify(associations,null,2));await fs.writeFile(root+'/project-source-inventory.json',JSON.stringify(catalog,null,2));
const summary={normalized:rows.length,existingSources:catalog.filter(x=>x.existing).length,newSources:additions.length,eligibleNew:additions.filter(x=>x.eligible).length,pendingNew:additions.filter(x=>!x.eligible).length,associations:associations.length,byPlatform:Object.fromEntries([...new Set(additions.map(x=>x.platform))].map(p=>[p,additions.filter(x=>x.platform===p).length]))};await fs.writeFile(root+'/source-delta-summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
