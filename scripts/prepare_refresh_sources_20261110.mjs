import fs from 'node:fs/promises';
import {normalizeSource} from './source_audit_normalize.mjs';
import {normalizeFacebookSource} from './facebook_source_resolver.mjs';
const root='outputs/project-refresh-2026-11-10';
const raw=JSON.parse(await fs.readFile(root+'/sources-raw.json','utf8'));
const sources=new Map(),references=[];
const report=/data monthly query|interaction monthly query|paid links|kols.?\s*seeding links|vf check|^link-id$|^top users kols$|^data$|^raw data$|sentiment|tagging|classification|phân loại|phan loai/i;
for(const r of raw){
 let reason=report.test(r.planSheet)?'REPORT_OR_ANALYTICAL_REFERENCE':'';
 const u=new URL(r.inputUrl),host=u.hostname.toLowerCase(),path=u.pathname;
 if(/(?:facebook\.com|fb\.com)$/.test(host)&&normalizeFacebookSource(r.inputUrl).status!=='SOURCE')reason||='CONTENT_OR_UNRESOLVED_LINK';
 if(/youtu\.be|youtube\.com/.test(host)&&!/\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/?$/.test(path))reason||='VIDEO_OR_SEARCH_REFERENCE';
 if(/tiktok\.com/.test(host)&&!/^\/@[^/]+\/?$/.test(path))reason||='VIDEO_OR_SEARCH_REFERENCE';
 if(/instagram\.com/.test(host)&&!/^\/[^/]+\/?$/.test(path))reason||='CONTENT_REFERENCE';
 if(/threads\.(?:net|com)/.test(host)&&!/^\/@[^/]+\/?$/.test(path))reason||='CONTENT_REFERENCE';
 if(reason){references.push({...r,referenceReason:reason});continue;}
 const n=normalizeSource(r.inputUrl,r.channel);if(!n||n.unresolved){references.push({...r,referenceReason:n?.unresolved||'INTERNAL_REFERENCE'});continue;}
 let s=sources.get(n.key);if(!s){s={...n,name:r.sourceName||'',projects:[],projectIds:[],projectStatuses:[],originalLinks:[],origins:[]};sources.set(n.key,s);}
 for(const [f,v]of [['projects',r.project],['projectIds',r.projectIds],['projectStatuses',r.projectStatus],['originalLinks',r.inputUrl]])if(v&&!s[f].includes(v))s[f].push(v);
 const o={project:r.project,projectIds:r.projectIds,planUrl:r.planUrl,sheet:r.planSheet,cell:r.cell};
 if(!s.origins.some(x=>JSON.stringify(x)===JSON.stringify(o)))s.origins.push(o);
}
const rows=[...sources.values()];await fs.writeFile(root+'/sources-normalized.json',JSON.stringify(rows,null,2));
await fs.writeFile(root+'/source-references.json',JSON.stringify(references));
console.log(JSON.stringify({raw:raw.length,sources:rows.length,references:references.length,channels:Object.fromEntries([...new Set(rows.map(x=>x.channel))].map(c=>[c,rows.filter(x=>x.channel===c).length]))}));
