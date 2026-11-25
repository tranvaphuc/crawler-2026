import fs from 'node:fs/promises';
import {normalizeSource} from './source_audit_normalize.mjs';
const root='outputs/source-audit-2026-10-22',old='outputs/project-sources-2026-10-21';
const targets=JSON.parse(await fs.readFile(root+'/targets.json','utf8')),prior=new Map(),checked=new Map();
for(const r of JSON.parse(await fs.readFile(old+'/sources.json','utf8'))){if(r.channel==='Facebook'&&r.id&&r.status==='RESOLVED'){prior.set(r.sourceKey,r);prior.set((r.type==='group'?'group:':'profile:')+r.id,r);if(r.profileId)prior.set('profile:'+r.profileId,r);}}
for(const l of(await fs.readFile(root+'/checked.jsonl','utf8')).split('\n').filter(Boolean)){const r=JSON.parse(l);checked.set(r.key,r);}
try{for(const l of(await fs.readFile(root+'/repairs.jsonl','utf8')).split('\n').filter(Boolean)){const r=JSON.parse(l);checked.set(r.key,r);}}catch(e){if(e.code!=='ENOENT')throw e;}
const overrides=JSON.parse(await fs.readFile(root+'/browser-verified.json','utf8'));
const groups=new Map();let checkedTargets=0;
function listedName(s){return s.listedNames.find(n=>n.length<150&&!/^(Main|Sub|Facebook|Link|ship|shipper)$/i.test(n)&&!/^Từ khóa|\bAND\b|siteName:/i.test(n))||'';}
function rank(s){return s==='live'?3:s==='die'?2:1;}
for(const s of targets){
 let r=checked.get(s.key);if(r)checkedTargets++;r={...r,...overrides[s.key]};if(r.httpStatus===404&&!['News','Forum','Website'].includes(s.channel)&&!overrides[s.key]){r.status='chưa xác định';r.note='HTTP 404 công khai; cần kiểm tra bằng phiên đăng nhập trước khi kết luận die';}let note=r.note||'';
 if(!r.id&&!overrides[s.key]&&s.channel==='Facebook'&&s.sourceKey&&prior.has(s.sourceKey)){const p=prior.get(s.sourceKey);if(!r.name||r.name===p.name||r.profileId&&r.profileId===p.profileId){r={...r,id:p.id,name:r.name||p.name,type:p.type,profileId:p.profileId,identityEvidence:'Previously verified Facebook metadata; '+(r.identityEvidence||'')};note+=(note?' | ':'')+'ID đã xác minh ở lượt trước; trạng thái hiện tại theo lượt kiểm tra mới';}}
 if(['News','Forum','Website'].includes(s.channel)&&/just a moment|access denied|attention required|checking your browser|bot verification|welcome to nginx|IIS Windows Server/i.test(r.name||'')){r.status='chưa xác định';note='Trang trả trang chặn/xác minh hoặc trang mặc định, chưa xác minh website nguồn hoạt động';}
 const id=r.id||(s.type==='group'?s.numericId:null)||s.id||null,status=r.status||'chưa xác định';let name=r.name||listedName(s);if(name.length>300)name=listedName(s);
 let url=r.url||s.url;if(s.channel==='Facebook'&&id)url='https://www.facebook.com/'+id;
 if(s.channel==='YouTube'&&id)url='https://www.youtube.com/channel/'+id;
 if(s.channel==='GG Reviews'&&r.cid)url='https://www.google.com/maps?cid='+r.cid;
 const key=s.channel+'|'+(id?String(id):url.toLowerCase());
 const row={channel:s.channel,originalLink:s.inputUrls.find(x=>x.replace(/\/$/,'')===s.url.replace(/\/$/,''))||s.inputUrls[0],name,id:id?String(id):null,url,type:r.type||s.type||'',status,note,cid:r.cid||null,placeId:r.placeId||null,inputUrls:s.inputUrls,projects:s.projects,identityEvidence:r.identityEvidence||'',checkedAt:r.checkedAt||null,keys:[s.key]};
 if(groups.has(key)){const g=groups.get(key);g.inputUrls=[...new Set([...g.inputUrls,...row.inputUrls])];g.projects=[...new Set([...g.projects,...row.projects])];g.keys.push(...row.keys);if(rank(row.status)>rank(g.status)){g.status=row.status;g.name=row.name||g.name;g.url=row.url;g.type=row.type||g.type;}g.name=g.name||row.name;g.cid=g.cid||row.cid;g.placeId=g.placeId||row.placeId;g.note=[...new Set([g.note,row.note].filter(Boolean))].join(' | ');}
 else groups.set(key,row);
}
const rows=[...groups.values()].sort((a,b)=>a.channel.localeCompare(b.channel)||a.name.localeCompare(b.name)||a.url.localeCompare(b.url));
for(const r of rows)if(r.inputUrls.length>1)r.note+=(r.note?' | ':'')+'Đã gộp '+r.inputUrls.length+' link gốc';
const summary={targets:targets.length,checkedTargets,sourceRows:rows.length,inputUrls:rows.reduce((a,r)=>a+r.inputUrls.length,0),channels:{}};
for(const r of rows){const c=summary.channels[r.channel]??={rows:0,live:0,die:0,unknown:0,withId:0};c.rows++;c[r.status==='chưa xác định'?'unknown':r.status]++;if(r.id)c.withId++;}
await fs.writeFile(root+'/sources-final.json',JSON.stringify(rows));await fs.writeFile(root+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
