import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
const dir='outputs/crawler-v8-2026-10-25';await fs.mkdir(dir,{recursive:true,mode:0o700});
const rows=JSON.parse(await fs.readFile('outputs/source-audit-followup-2026-10-22/sources-current.json'));
const unique=new Map();
for(const r of rows){
 const platform=r.channel?.toLowerCase();if(!['facebook','threads','instagram','youtube'].includes(platform))continue;
 const type=r.type||'unknown',id=typeof r.id==='string'&&r.id.trim()?r.id.trim():null;
 const url=platform==='facebook'&&id&&['page','user','group'].includes(type)?`https://www.facebook.com/${type==='group'?'groups/':''}${id}`:r.url||r.originalLink;
 let reason=null;if(r.status!=='live')reason='SOURCE_NOT_VERIFIED_LIVE';
 if(!id||!(platform==='youtube'?/^UC[\w-]{22}$/:/^\d+$/).test(id))reason='SOURCE_ID_UNVERIFIED';
 if(!({facebook:['page','user','group'],threads:['profile'],instagram:['profile'],youtube:['channel']})[platform].includes(type))reason='SOURCE_TYPE_UNVERIFIED';
 if(!url||!/^https:\/\//.test(url))reason='SOURCE_URL_UNVERIFIED';
 const key=`${platform}:${type}:${id||createHash('sha256').update(url||r.originalLink||'').digest('hex').slice(0,24)}`;
 const old=unique.get(key);if(old){old.originalLinks=[...new Set([...old.originalLinks,...r.inputUrls||[],r.originalLink].filter(Boolean))];old.projects=[...new Set([...old.projects,...r.projects||[]])];continue;}
 unique.set(key,{_id:key,platform,type,nativeId:id,name:r.name||'',url,originalLinks:[...new Set([r.originalLink,...r.inputUrls||[]].filter(Boolean))],projects:r.projects||[],audit:{status:r.status,note:r.note||'',identityEvidence:r.identityEvidence||null,checkedAt:r.checkedAt||null},eligible:!reason,blockedReason:reason});
}
const sources=[...unique.values()];const summary={createdAt:new Date().toISOString(),total:sources.length,eligible:sources.filter(x=>x.eligible).length,blocked:sources.filter(x=>!x.eligible).length,byChannel:{}};
for(const s of sources){const key=s.platform+(s.platform==='facebook'?'.'+s.type:'');const v=summary.byChannel[key]||={total:0,eligible:0,blocked:0};v.total++;v[s.eligible?'eligible':'blocked']++;}
await fs.writeFile(dir+'/sources.json',JSON.stringify(sources)+'\n',{mode:0o600});
const text=await fs.readFile('/Users/phuctran/.codex/attachments/b0ddfbaa-fede-4e49-8d80-23e7621e5563/Pasted text.txt','utf8');const keys=[...new Set(text.split(/\s+/).filter(x=>/^[a-zA-Z]{20,40}$/.test(x)))];
if(keys.length!==250)throw Error('ATTACHMENT_KEY_COUNT_REVIEW');await fs.writeFile(dir+'/added-keys.credentials.json',JSON.stringify({keys})+'\n',{mode:0o600});summary.attachedUniqueKeys=keys.length;
await fs.writeFile(dir+'/inventory.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
