import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import 'dotenv/config';
import {normalizeFacebookSource} from './facebook_source_resolver.mjs';
import {snapshotPayloads} from '../src/services/socialMetrics.js';
import {fetchTextWithDeadline} from './nguoinoitieng_http.mjs';

export const PLATFORMS=new Set(['facebook','instagram','tiktok','youtube','threads']);
const ROOT='outputs/nguoinoitieng-2026-11-18';
const OUT=ROOT+'/platform-ids-2026-11-25';
const numeric=v=>typeof v==='string'&&/^[1-9]\d{4,24}$/.test(v)?v:null;
const sha=s=>createHash('sha256').update(s).digest('hex');
const readLines=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8').split('\n').filter(Boolean).map(JSON.parse):[];
const write=(p,v)=>{fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
export function normalizeAccount(platform,url){
 const u=new URL(url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port)throw Error('INVALID_URL');
 if(platform==='facebook'){
  // Legacy profile tabs and /p/name-ID still identify the account itself.
  if(u.pathname.includes('https:'))throw Error('MALFORMED_CONCATENATED_URL');
  const named=/^\/p\/[^/]+-(\d+)\/?$/.exec(u.pathname);
  if(named)u.pathname='/'+named[1];
  u.pathname=u.pathname.replace(/\/(?:timeline|info|likes|notes|about_places)\/?$/i,'').replace(/\/app\/\d+\/?$/i,'');
  const s=normalizeFacebookSource(u.href);if(s.status!=='SOURCE'||s.typeHint==='group')throw Error('INVALID_ACCOUNT_URL');
  return {key:'facebook:'+s.key,url:s.url,route:s.route,urlId:numeric(s.numericId)};
 }
 const hosts={instagram:/^(?:www\.)?instagram\.com$/,tiktok:/^(?:www\.)?tiktok\.com$/,youtube:/^(?:www\.|m\.)?youtube\.com$/,threads:/^(?:www\.)?threads\.(?:net|com)$/};
 if(!hosts[platform]?.test(u.hostname))throw Error('PLATFORM_HOST_MISMATCH');
 const parts=u.pathname.split('/').filter(Boolean);
 if(platform==='youtube'){
  if(!((parts.length===2&&['channel','user','c'].includes(parts[0]))||(parts.length===1&&parts[0].startsWith('@'))))throw Error('INVALID_CHANNEL_URL');
  const channel=parts[0]==='channel'&&/^UC[\w-]{22}$/.test(parts[1])?parts[1]:null;
  return {key:'youtube:'+parts.join('/'),url:'https://www.youtube.com/'+parts.join('/'),urlId:channel};
 }
 if(parts.length!==1||['p','reel','explore','accounts','login'].includes(parts[0]))throw Error('INVALID_ACCOUNT_URL');
 const handle=parts[0].replace(/^@/,'');if(!/^[\w.]+$/.test(handle))throw Error('INVALID_HANDLE');
 return {key:platform+':'+handle.toLowerCase(),handle,url:`https://www.${platform==='threads'?'threads.com':platform+'.com'}/${['threads','tiktok'].includes(platform)?'@':''}${handle}`};
}
export function facebookRouteIdentity(data,route){
 const p=data?.payload?.payloads?.[route];if(!p||p.error)return {status:'unresolved',reason:'FACEBOOK_ROUTE_MISSING_OR_ERROR'};
 let r=p.result;for(let i=0;i<5&&r?.type==='route_redirect';i++)r=r.redirect_result;
 const e=r?.exports,props=e?.rootView?.props,name=e?.canonicalRouteName||'';
 if(/Login|Checkpoint|Challenge/i.test(name))return {status:'blocked',reason:'FACEBOOK_LOGIN_OR_CHECKPOINT'};
 if(!/Profile|Page/.test(name)||/Error|Story|Video|Permalink/.test(name)||!props)return {status:'unresolved',reason:'FACEBOOK_PROFILE_NOT_PUBLIC',route_name:name};
 const pageId=numeric(props.pageID)||numeric(props.pageId),profileId=numeric(props.userID)||numeric(props.profileID)||numeric(props.profileId);
 if(!pageId&&!profileId)return {status:'unresolved',reason:'FACEBOOK_NATIVE_ID_NOT_RETURNED',route_name:name};
 return {status:'resolved',id:pageId||profileId,id_type:pageId?'page_id':'profile_id',profile_id:profileId,page_id:pageId,evidence:'matched_facebook_route.rootView.props.'+(pageId?'pageID':'userID'),route_name:name};
}
function load(){
 const people=readLines(ROOT+'/vietnamese-people.jsonl').filter(p=>p.has_subject_platform_link);
 const accounts=new Map();let links=0;
 for(const p of people)for(const l of p.platform_links)if(PLATFORMS.has(l.platform)){
  links++;let n;try{n=normalizeAccount(l.platform,l.url);}catch{n={key:l.platform+':invalid:'+sha(l.url),url:l.url,invalid:true};}
  if(!accounts.has(n.key))accounts.set(n.key,{...n,platform:l.platform,original_urls:[],person_ids:[]});
  const a=accounts.get(n.key);if(!a.original_urls.includes(l.url))a.original_urls.push(l.url);if(!a.person_ids.includes(p.person_id))a.person_ids.push(p.person_id);
 }
 return {people,accounts,links};
}
function seedCache(accounts,results,record){
 const facts=new Map();
 const add=(url,row)=>{let n;try{n=normalizeAccount('facebook',url);}catch{return;}if(!accounts.has(n.key)||!numeric(row.id))return;if(!facts.has(n.key))facts.set(n.key,[]);facts.get(n.key).push(row);};
 const p= 'outputs/project-sources-2026-10-21/facebook-resolved.jsonl';
 for(const r of readLines(p))if(r.status==='RESOLVED'&&['page','user'].includes(r.type)&&! /Error|Login|Checkpoint/.test(r.routeName||'')){
  const fact={id:r.id,profile_id:r.profileId||null,page_id:r.type==='page'?r.id:null,id_type:r.type==='page'?'page_id':'profile_id',evidence:r.evidencePath,source_file:p,observed_at:r.resolvedAt};
  for(const u of [r.inputUrl,r.url].filter(Boolean))add(u,fact);
 }
 const p2='outputs/source-keyword-catalog-2026-11-19/cross-platform-audit/active-facebook-chrome-recheck/api-resolve-results.jsonl';
 for(const r of readLines(p2))if(r.status==='resolved'&&r.id&&r.evidence)add(r.target,{id:r.id,page_id:r.type==='page'?r.id:null,id_type:r.type==='page'?'page_id':'profile_id',evidence:r.evidence,source_file:p2,observed_at:r.checked_at});
 for(const a of accounts.values())if(!results.has(a.key)){
  if(a.invalid){record({key:a.key,status:'unresolved',reason:'INVALID_ACCOUNT_URL',method:'input_validation'});continue;}
  const rows=facts.get(a.key)||[],ids=new Set(rows.map(r=>r.id));
  if(ids.size===1){record({key:a.key,status:'resolved',...rows.at(-1),method:'existing_verified_cache',live_checked:false});continue;}
  if(ids.size>1){record({key:a.key,status:'unresolved',reason:'CACHE_ID_CONFLICT',method:'cache_comparison'});continue;}
  if(a.urlId)record({key:a.key,status:'resolved',id:a.urlId,id_type:a.platform==='youtube'?'channel_id':'url_account_id',evidence:'native_account_id_in_original_url',method:'url_structure',live_checked:false});
 }
}
function exportResults(people,accounts,results,links,state){
 const byPlatform=Object.fromEntries([...PLATFORMS].map(p=>[p,{unique_accounts:0,resolved:0,unresolved:0,pending:0}]));
 const accountRows=[...accounts.values()].map(a=>{const r=results.get(a.key)||{status:'pending'};const row={...a,...r};const c=byPlatform[a.platform];c.unique_accounts++;c[r.status==='resolved'?'resolved':r.status==='pending'?'pending':'unresolved']++;return row;});
 fs.writeFileSync(OUT+'/accounts.jsonl',accountRows.map(r=>JSON.stringify(r)).join('\n')+'\n');
 const pRows=people.map(p=>({person_id:p.person_id,name:p.name,occupations:p.occupations,source_urls:p.source_urls,classification_strength:p.classification_strength,accounts:p.platform_links.filter(l=>PLATFORMS.has(l.platform)).map(l=>{let n;try{n=normalizeAccount(l.platform,l.url);}catch{n={key:l.platform+':invalid:'+sha(l.url)};}return {platform:l.platform,original_url:l.url,account_key:n.key,...(results.get(n.key)||{status:'pending'})};})}));
 fs.writeFileSync(OUT+'/people-platform-ids.jsonl',pRows.map(r=>JSON.stringify(r)).join('\n')+'\n');
 const counts={};for(const r of accountRows)counts[r.status]=(counts[r.status]||0)+1;
 const summary={updated_at:new Date().toISOString(),state,input_people:people.length,people_with_requested_platform:pRows.filter(r=>r.accounts.length).length,people_only_other_platform:pRows.filter(r=>!r.accounts.length).length,input_link_occurrences:links,unique_accounts:accounts.size,counts,by_platform:byPlatform,people_all_ids_found:pRows.filter(r=>r.accounts.length&&r.accounts.every(a=>a.status==='resolved')).length,people_any_id_found:pRows.filter(r=>r.accounts.some(a=>a.status==='resolved')).length,notes:['ID là chuỗi để tránh làm tròn số. Handle không được coi là native ID.','Facebook profile_id và page_id khác nhau; giữ riêng nếu có bằng chứng. id_type cho biết cột id đang chứa loại nào.','ID lấy từ cấu trúc URL không chứng minh tài khoản còn hoạt động; cache có thời điểm quan sát riêng.','Kết quả không xác minh tài khoản chính chủ của người trong nguoinoitieng.tv.','Không thêm người không có link; Twitter/X nằm ngoài 5 nền tảng được yêu cầu.']};
 write(OUT+'/summary.json',summary);return summary;
}
async function run(){
 fs.mkdirSync(OUT,{recursive:true});const {people,accounts,links}=load(),results=new Map(readLines(OUT+'/resolution-journal.jsonl').map(r=>[r.key,r]));
 const record=r=>{r={checked_at:new Date().toISOString(),...r};results.set(r.key,r);fs.appendFileSync(OUT+'/resolution-journal.jsonl',JSON.stringify(r)+'\n');};
 seedCache(accounts,results,record);write(OUT+'/manifest.json',{created_at:new Date().toISOString(),people:people.length,accounts:[...accounts.values()]});
 const exportNow=state=>exportResults(people,accounts,results,links,state);
 if(!process.argv.includes('--live')){console.log(JSON.stringify(exportNow([...accounts.keys()].every(k=>results.has(k))?'finished':'prepared')));return;}
 let stopped=false;for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>stopped=true);
 const retry=process.argv.includes('--retry-unresolved');
 const work=[...accounts.values()].filter(a=>!results.has(a.key)||retry&&results.get(a.key).status!=='resolved');
 const maxArg=process.argv.find(x=>x.startsWith('--max='));if(maxArg)work.splice(Number(maxArg.slice(6)));
 const timer=setInterval(()=>{console.log(JSON.stringify(exportNow('running')));},30000);
 const headers={'user-agent':'Mozilla/5.0'};
 let apiBlocked=null,fbBlocked=null;
 try{
  const fbWork=work.filter(a=>a.platform==='facebook');
  if(fbWork.length){
   let context={__user:'0',av:'0',__a:'1',__comet_req:'15',routing_namespace:'fb_comet'},contextAt=0;
   async function refresh(){
    const {response,body}=await fetchTextWithDeadline('https://www.facebook.com/NghesyChiTai',{headers,timeoutMs:25000});
    if(response.status!==200)throw Error('FACEBOOK_BOOTSTRAP_HTTP_'+response.status);
    const walk=x=>{if(!x||typeof x!=='object')return;if(Array.isArray(x)){if(x[0]==='LSD')context.lsd=x[2]?.token;if(x[0]==='SiteData')for(const k of ['__spin_r','__spin_b','__spin_t'])if(x[2]?.[k]!=null)context[k]=String(x[2][k]);}for(const v of Object.values(x))if(v&&typeof v==='object')walk(v);};snapshotPayloads(body).forEach(walk);
    if(!context.lsd)throw Error('FACEBOOK_PUBLIC_CONTEXT_UNAVAILABLE');contextAt=Date.now();
   }
   let fbOffset=0;
   async function worker(){while(fbOffset<fbWork.length&&!stopped&&!fbBlocked){
    const batch=fbWork.slice(fbOffset,fbOffset+10);fbOffset+=batch.length;
    try{
     if(Date.now()-contextAt>600000)await refresh();
     const form={...context};batch.forEach((a,i)=>form[`route_urls[${i}]`]=a.route);
     const {response,body}=await fetchTextWithDeadline('https://www.facebook.com/ajax/bulk-route-definitions/',{method:'POST',headers:{...headers,'content-type':'application/x-www-form-urlencoded','x-fb-lsd':context.lsd},body:new URLSearchParams(form),timeoutMs:25000});
     if([401,403,429].includes(response.status))throw Error('FACEBOOK_ACCESS_LIMIT_'+response.status);
     if(response.status!==200)throw Error('FACEBOOK_HTTP_'+response.status);
     let data;try{data=JSON.parse(body.replace(/^for\s*\(;;\);\s*/,''));}catch{throw Error('FACEBOOK_INVALID_RESPONSE');}
     if(data.error||!data.payload?.payloads)throw Error('FACEBOOK_ROUTE_REQUEST_REJECTED');
     const digest=sha(body);
     for(const a of batch){const r=facebookRouteIdentity(data,a.route);record({key:a.key,...r,method:'anonymous_facebook_bulk_route',live_checked:true,response_sha256:digest});if(r.status==='blocked')fbBlocked=r.reason;}
    }catch(e){const reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;for(const a of batch)record({key:a.key,status:'unresolved',reason,method:'anonymous_facebook_bulk_route'});fbBlocked=reason;}
    await new Promise(r=>setTimeout(r,400));
   }}
   try{await refresh();await Promise.all([worker(),worker()]);}catch(e){fbBlocked=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;}
  }
  let next=0;const other=work.filter(a=>a.platform!=='facebook');
  async function apiWorker(){while(next<other.length&&!stopped&&!apiBlocked){
   const a=other[next++];
   try{
    if(a.platform==='tiktok'){
     const {response,body}=await fetchTextWithDeadline(a.url,{headers,timeoutMs:25000});
     if([401,403,429].includes(response.status)){record({key:a.key,status:'unresolved',reason:'TIKTOK_ACCESS_LIMIT_'+response.status,method:'public_profile'});continue;}
     const roots=[];for(const m of body.matchAll(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi))try{roots.push(JSON.parse(m[1]));}catch{}
     const matches=new Map();const walk=x=>{if(!x||typeof x!=='object')return;if(typeof x.uniqueId==='string'&&x.uniqueId.toLowerCase()===a.handle.toLowerCase()&&numeric(x.id))matches.set(x.id,{id:x.id,sec_uid:x.secUid||null});for(const v of Object.values(x))if(v&&typeof v==='object')walk(v);};roots.forEach(walk);
     record({key:a.key,...(matches.size===1?{status:'resolved',...matches.values().next().value,id_type:'user_id',evidence:'matched_tiktok_uniqueId.id'}:{status:'unresolved',reason:matches.size?'TIKTOK_ID_CONFLICT':'TIKTOK_NATIVE_ID_NOT_PUBLIC'}),method:'public_profile',live_checked:true,response_sha256:sha(body),http_status:response.status});continue;
    }
    const domain=process.env.DOMAIN_FOR_API,secret=process.env.AUTHEN_KEY_FOR_DOMAIN;if(!domain||!secret)throw Error('CRAWLER_API_CONFIG_REQUIRED');
    const endpoint=new URL('/api/social/resource/resolve',domain.includes('://')?domain:'https://'+domain);if(endpoint.protocol!=='https:')throw Error('CRAWLER_API_HTTPS_REQUIRED');
    const {response,body}=await fetchTextWithDeadline(endpoint,{method:'POST',redirect:'error',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},body:JSON.stringify({url:a.url,platform:a.platform,kind:'source'}),timeoutMs:35000});
    let d;try{d=JSON.parse(body);}catch{throw Error('CRAWLER_API_INVALID_RESPONSE');}
    const valid=response.ok&&d.status==='resolved'&&d.idVerified===true&&typeof d.id==='string'&&(a.platform==='youtube'?/^UC[\w-]{22}$/.test(d.id):!!numeric(d.id))&&typeof d.evidence==='string'&&d.evidence.startsWith('matched_');
    const reason=typeof d.reason==='string'&&/^[A-Z0-9_]+$/.test(d.reason)?d.reason:'NATIVE_ID_UNVERIFIED';
    record({key:a.key,status:valid?'resolved':'unresolved',...(valid?{id:d.id,id_type:a.platform==='youtube'?'channel_id':'user_id',evidence:d.evidence}: {reason}),method:'existing_crawler_api',live_checked:true,http_status:response.status});
    if([401,403,429].includes(response.status)||['security_checkpoint','rate_limited','auth_required'].includes(d.status))apiBlocked=reason;
   }catch(e){const reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;record({key:a.key,status:'unresolved',reason,method:'public_lookup'});if(/CONFIG|HTTPS|INVALID_RESPONSE/.test(reason)||e.cause?.code==='ENOTFOUND')apiBlocked=reason;}
  }}
  await Promise.all([apiWorker(),apiWorker()]);
 }finally{clearInterval(timer);const summary=exportNow(stopped?'stopped':fbBlocked||apiBlocked?'blocked':'finished');write(OUT+'/run-status.json',{at:new Date().toISOString(),facebook_blocked:fbBlocked,api_blocked:apiBlocked,stopped});console.log(JSON.stringify(summary));}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await run();
