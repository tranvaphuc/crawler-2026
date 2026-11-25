import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export function dedupSources(rows){
 const groups=new Map();
 for(const row of rows){
  let normalized='';try{const u=new URL(row.url);normalized=u.hostname.toLowerCase().replace(/^www\./,'')+u.pathname.replace(/\/+$/,'').toLowerCase();}catch{}
  const identity=row.id?'id:'+row.id:normalized?'url:'+normalized:'input:'+row.originalLink;
  const k=row.channel+'|'+identity;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);
 }
 return [...groups.values()].map(rs=>{
  if(rs.length===1)return rs[0];
  const score=r=>(r.status==='live'?4:0)+(r.id?2:0);
  const sorted=[...rs].sort((a,b)=>score(b)-score(a)||String(b.checkedAt||'').localeCompare(String(a.checkedAt||'')));
  const r={...sorted[0]};for(const f of ['keys','inputUrls','projects'])r[f]=[...new Set(rs.flatMap(x=>x[f]||[]))];
  r.note=[...new Set(rs.map(x=>x.note).filter(Boolean))].join(' | ');return r;
 });
}
export function mergeDomains(rows) {
 const groups=new Map();
 for(const row of rows.filter(r=>['News','Forum','Website'].includes(r.channel))){
  let url;try{url=new URL(row.url||row.originalLink);}catch{continue;}
  const domain=url.hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');
  if(!groups.has(domain))groups.set(domain,[]);groups.get(domain).push(row);
 }
 return [...groups].map(([domain,items])=>{
  const rank=r=>(r.status==='live'?3:r.status==='chưa xác định'?2:1);
  const sorted=[...items].sort((a,b)=>rank(b)-rank(a)||String(b.checkedAt||'').localeCompare(String(a.checkedAt||'')));
  const chosen=sorted[0],u=new URL(chosen.url||chosen.originalLink);u.pathname='/';u.search='';u.hash='';
  const types=['News','Forum','Website'].filter(c=>items.some(r=>r.channel===c)).map(c=>c.toLowerCase());
  const notes=[...new Set(items.map(r=>r.note).filter(Boolean))];
  if(items.length>1)notes.push(`Đã gộp ${items.length} bản ghi theo domain; loại nguồn: ${types.join(', ')}.`);
  if(new Set(items.map(r=>r.status)).size>1)notes.push('Có trạng thái khác nhau giữa các bản ghi; ưu tiên bằng chứng nguồn đang live, giữ ghi chú để đối chiếu.');
  return {type:types.join(' / '),domain,link:u.href,status:chosen.status,note:notes.join(' | '),inputUrls:[...new Set(items.flatMap(r=>r.inputUrls||[r.originalLink]))],keys:[...new Set(items.flatMap(r=>r.keys||[]))]};
 }).sort((a,b)=>a.domain.localeCompare(b.domain));
}
async function main(){
 const old=new URL('../outputs/source-audit-2026-10-22/',import.meta.url),root=new URL('../outputs/source-audit-followup-2026-10-22/',import.meta.url);
 await fs.mkdir(root,{recursive:true});
 const baseFile=new URL('sources-base.json',root);
 let rows;try{rows=JSON.parse(await fs.readFile(baseFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;rows=JSON.parse(await fs.readFile(new URL('sources-final.json',old),'utf8'));await fs.writeFile(baseFile,JSON.stringify(rows,null,2));}
 const updatesFile=new URL('browser-updates.jsonl',root);let updates=[];
 try{updates=(await fs.readFile(updatesFile,'utf8')).split('\n').filter(Boolean).map(JSON.parse);}catch(e){if(e.code!=='ENOENT')throw e;await fs.writeFile(updatesFile,'');}
 const byKey=new Map();for(const u of updates)for(const key of u.keys||[])byKey.set(key,{...byKey.get(key),...u});
 const fields=['name','id','cid','placeId','url','type','status','note','checkedAt','identityEvidence'];
 rows=rows.map(row=>{const u=(row.keys||[]).map(k=>byKey.get(k)).filter(Boolean).at(-1);if(!u)return row;const r={...row};for(const k of fields)if(Object.hasOwn(u,k))r[k]=u[k];if(r.channel==='Threads'&&r.status==='live'&&r.id){try{const before=new URL(row.originalLink).pathname.split('/').filter(Boolean)[0],after=new URL(r.url).pathname.split('/').filter(Boolean)[0];if(before?.startsWith('@')&&after?.startsWith('@')&&before.toLowerCase()!==after.toLowerCase())r.note=(r.note||'')+' Username trong link gốc ('+before+') khác profile chủ bài hiện tại ('+after+'); đã xác minh nguồn hiện tại qua bài gốc/redirect và profile, giữ nguyên link gốc để đối chiếu.';}catch{}}return r;});
 const deduped=dedupSources(rows);
 await fs.writeFile(new URL('sources-current.json',root),JSON.stringify(deduped,null,2));
 const domains=mergeDomains(deduped);await fs.writeFile(new URL('domains.json',root),JSON.stringify(domains,null,2));
 const channels=['Facebook','Threads','Instagram','LinkedIn','YouTube'];
 const queue=rows.flatMap((r,index)=>r.status==='chưa xác định'&&channels.includes(r.channel)?[{index,channel:r.channel,keys:r.keys,originalLink:r.originalLink,url:r.url,name:r.name,id:r.id,note:r.note}]:[]);
 await fs.writeFile(new URL('browser-pending.json',root),JSON.stringify(queue,null,2));
 for(const channel of channels)await fs.writeFile(new URL(channel.toLowerCase()+'-pending.json',root),JSON.stringify(queue.filter(r=>r.channel===channel),null,2));
 const counts=Object.fromEntries(channels.map(c=>[c,queue.filter(r=>r.channel===c).length]));
 console.log(JSON.stringify({rows:rows.length,webRowsBefore:rows.filter(r=>['News','Forum','Website'].includes(r.channel)).length,domainsAfter:domains.length,duplicatesRemoved:rows.filter(r=>['News','Forum','Website'].includes(r.channel)).length-domains.length,pending:counts}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
