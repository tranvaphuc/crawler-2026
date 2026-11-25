import fs from 'node:fs/promises';
import {unlinkSync} from 'node:fs';
import {fetchPage,parseMetadata,decode} from './source_audit_metadata.mjs';
import {createFacebookSourceResolver} from './facebook_source_resolver.mjs';
const root='outputs/source-audit-2026-10-22';
const lockPath=root+'/run.lock';
try{const oldPid=Number(await fs.readFile(lockPath,'utf8'));let alive=false;try{process.kill(oldPid,0);alive=true;}catch(e){if(e.code!=='ESRCH')throw e;}if(alive)throw new Error('Audit already running: '+oldPid);await fs.unlink(lockPath);}catch(e){if(e.code!=='ENOENT')throw e;}
const lock=await fs.open(lockPath,'wx');await lock.writeFile(String(process.pid));await lock.close();process.on('exit',()=>{try{unlinkSync(lockPath);}catch{}});
const targets=JSON.parse(await fs.readFile(root+'/targets.json','utf8'));
const results=new Map();try{for(const l of(await fs.readFile(root+'/checked.jsonl','utf8')).split('\n').filter(Boolean)){const r=JSON.parse(l);results.set(r.key,r);}}catch(e){if(e.code!=='ENOENT')throw e;}
let stopping=false,done=0;process.on('SIGTERM',()=>stopping=true);process.on('SIGINT',()=>stopping=true);
async function save(s,r){const x={key:s.key,channel:s.channel,...r,checkedAt:r.checkedAt||new Date().toISOString()};results.set(s.key,x);await fs.appendFile(root+'/checked.jsonl',JSON.stringify(x)+'\n');done++;if(done%100===0)await progress();}
async function progress(){const state={phase:stopping?'STOPPED':'RUNNING',targets:targets.length,checked:results.size,updatedAt:new Date().toISOString(),channels:{}};for(const r of results.values()){const c=state.channels[r.channel]??={};c[r.status]=(c[r.status]||0)+1;}await fs.writeFile(root+'/state.json',JSON.stringify(state,null,2));console.log(JSON.stringify({checked:results.size,targets:targets.length}));}
const fb=targets.filter(s=>s.channel==='Facebook'&&s.sourceKey&&!results.has(s.key)),batches=[];for(let i=0;i<fb.length;i+=10)batches.push(fb.slice(i,i+10));
const resolver=await createFacebookSourceResolver({harPath:'/Users/phuctran/Downloads/www.facebook.com_findIdPAge.har',timeoutMs:18000});let fbBlocked=false;
async function fbWorker(){while(batches.length&&!stopping){const batch=batches.shift();if(fbBlocked){for(const s of batch)await save(s,{status:'chưa xác định',note:'Facebook giới hạn truy cập; cần kiểm tra bằng phiên đăng nhập'});continue;}
 try{const rows=await resolver.resolveRoutes(batch.map(s=>({...s,key:s.sourceKey})));for(let i=0;i<batch.length;i++){const s=batch[i];let r=rows[i];if(r.status==='PROFILE_ID_ONLY'&&r.profileId){try{r=await resolver.resolveProfile(r);}catch(e){r={...r,status:e.code||'ERROR'};}}
 const verified=r.status==='RESOLVED';await save(s,{id:verified?r.id:null,name:r.name||'',type:r.type||s.type||null,url:verified?'https://www.facebook.com/'+r.id:s.url,status:verified?'live':'chưa xác định',note:verified?'':'Không lấy được metadata ẩn danh; chưa kết luận source die',profileId:r.profileId||null,identityEvidence:r.evidencePath||'',sourceStatus:r.status,routeName:r.routeName||''});}}
 catch(e){if(e.code==='FACEBOOK_RATE_LIMITED')fbBlocked=true;for(const s of batch)await save(s,{status:'chưa xác định',note:'Lỗi kiểm tra Facebook: '+(e.code||'NETWORK_ERROR')});}}
}
const remaining=targets.filter(s=>s.channel!=='Facebook'||!s.sourceKey).filter(s=>!results.has(s.key));
// Spread platform requests among domains rather than hammering a single social service.
const queues=new Map();for(const s of remaining){const c=queues.get(s.channel)??[];c.push(s);queues.set(s.channel,c);}const queue=[];while([...queues.values()].some(a=>a.length))for(const a of queues.values())if(a.length)queue.push(a.shift());
const blockedHosts=new Set();
async function webWorker(){while(queue.length&&!stopping){const s=queue.shift();if(blockedHosts.has(s.channel)){await save(s,{id:s.id||null,type:s.type,status:'chưa xác định',url:s.url,note:'Channel đang giới hạn truy cập; cần kiểm tra bằng phiên đăng nhập'});continue;}
 try{const p=await fetchPage(s.url);if(p.status===429)blockedHosts.add(s.channel);let r;if(s.channel==='Facebook'){r={id:null,name:'',url:s.url,type:null,status:'chưa xác định',note:'Chưa xác định tác giả từ link chia sẻ/nội dung',httpStatus:p.status};}else r=parseMetadata(s,p);
 if(s.channel==='GG Reviews'&&p.status===200){const preview=p.body.match(/<link href="([^"<]*\/maps\/preview\/place\?[^"<]*)"/);if(preview){try{const v=await fetchPage(new URL(decode(preview[1]),'https://www.google.com').href);const a=JSON.parse(v.body.replace(/^\)\]\}'\s*/,''));const place=a?.[6];if(typeof place?.[11]==='string'&&/^ChI[\w-]+$/.test(place?.[78]??'')&&r.cid){r={...r,name:place[11],placeId:place[78],status:'live',note:'',identityEvidence:'Google Maps place preview: CID + name + Place ID'};}}catch{}}}
 if(s.channel==='LinkedIn'&&!r.id&&r.url!==s.url&&/linkedin\.com\/(?:company|school)\//.test(r.url)){const sourcePage=await fetchPage(r.url);r=parseMetadata({...s,url:r.url,type:'company'},sourcePage);}
 await save(s,r);}
 catch(e){await save(s,{id:s.id||null,url:s.url,type:s.type,status:'chưa xác định',note:'Lỗi kết nối '+(e.code||e.message)+'; chưa kết luận source die'});}}
}
await Promise.all([...Array.from({length:6},()=>fbWorker()),...Array.from({length:10},()=>webWorker())]);
await progress();const state=JSON.parse(await fs.readFile(root+'/state.json','utf8'));state.phase=stopping?'STOPPED':'FINISHED';await fs.writeFile(root+'/state.json',JSON.stringify(state,null,2));console.log(JSON.stringify(state));
