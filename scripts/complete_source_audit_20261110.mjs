import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import dns from 'node:dns';import net from 'node:net';
import {fetchPage,parseMetadata,decode} from './source_audit_metadata.mjs';
const root='outputs/project-refresh-2026-11-10',dir=root+'/completion';await fs.mkdir(dir,{recursive:true});
const rows=JSON.parse(await fs.readFile(root+'/sources-to-add.json','utf8')).filter(x=>!x.eligible);
const done=new Map();try{for(const l of(await fs.readFile(dir+'/source-checks.jsonl','utf8')).split('\n').filter(Boolean)){const r=JSON.parse(l);done.set(r._id,r);}}catch(e){if(e.code!=='ENOENT')throw e;}
const queues=new Map();for(const r of rows.filter(x=>!done.has(x._id))){let q=queues.get(r.platform);if(!q)queues.set(r.platform,q=[]);q.push(r);}
const blocked=new Set();let stopping=false;process.on('SIGTERM',()=>stopping=true);process.on('SIGINT',()=>stopping=true);
const publicAddress=a=>!(/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(a)||a==='::1'||/^(?:fc|fd|fe80):/i.test(a));
const lookup=(host,opts,cb)=>dns.lookup(host,opts,(err,address,family)=>{if(err)return cb(err);const aa=Array.isArray(address)?address.map(x=>x.address):[address];if(aa.some(x=>!publicAddress(x)))return cb(Object.assign(Error('Non-public address'),{code:'NON_PUBLIC_DESTINATION'}));cb(null,address,family);});
const title=b=>decode(b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/\s+/g,' ').trim();
const channels={facebook:'Facebook',instagram:'Instagram',threads:'Threads',youtube:'YouTube',tiktok:'TikTok',linkedin:'LinkedIn',news:'News',forum:'Forum',website:'Website','gg reviews':'GG Reviews',x:'X'};
async function check(r){
 const host=new URL(r.url).hostname;
 if(blocked.has(host))return {_id:r._id,platform:r.platform,url:r.url,decision:'ACCESS_LIMITED',note:'Host đã trả HTTP 429 trong lượt kiểm tra; dừng các request còn lại trên host này, không kết luận source hỏng.'};
 try{
  const p=await fetchPage(r.url,{timeout:15000,maxBytes:1800000,lookup});
  if(p.status===429)blocked.add(host);
  const m=parseMetadata({channel:channels[r.platform]||'Website',url:r.url,type:r.type,id:r.nativeId},p),t=title(p.body);
  const gate=/captcha|verify you are human|just a moment|checking your browser|access denied|enable javascript and cookies|cloudflare ray id|datadome/i.test(t+' '+p.body.slice(0,12000));
  let decision='UNCONFIRMED';
  if(gate||[401,403,429,999].includes(p.status))decision='ACCESS_LIMITED';
  else if([404,410].includes(p.status))decision='HTTP_NOT_FOUND';
  else if(p.status===200&&m.status==='live'&&m.name)decision=['news','forum','website'].includes(r.platform)?'WEB_CONTENT_CONFIRMED':'IDENTITY_CONFIRMED';
  else if(p.status===200)decision='RESPONSE_WITHOUT_VERIFIED_IDENTITY';
  const result={_id:r._id,platform:r.platform,inputUrl:r.url,decision,...m,httpStatus:p.status,responseTitle:t,responseUrl:p.url,responseBytes:Buffer.byteLength(p.body),sha256:createHash('sha256').update(p.body).digest('hex'),checkedAt:new Date().toISOString()};
  if(r.platform==='facebook'){
   const page=p.body.match(/<meta[^>]+property=["']al:android:url["'][^>]+content=["']fb:\/\/page\/(\d+)/i)?.[1]||p.body.match(/"delegate_page"\s*:\s*\{\s*"id"\s*:\s*"(\d+)"/)?.[1];
   if(page&&!gate&&p.status===200){result.candidateNativeId=page;result.candidateType='page';result.note='ID candidate trong metadata; cần kiểm chứng đúng owner trước khi enable.';}
  }
  if(['facebook','youtube','instagram','threads','tiktok'].includes(r.platform)&&!gate&&p.status===200){const file=dir+'/response-'+createHash('sha256').update(r._id).digest('hex').slice(0,16)+'.html';await fs.writeFile(file,p.body);result.responseFile=file;}
  return result;
 }catch(e){return {_id:r._id,platform:r.platform,inputUrl:r.url,decision:e.code==='NON_PUBLIC_DESTINATION'?'EXCLUDED_NON_PUBLIC_DESTINATION':'NETWORK_UNCONFIRMED',error:e.code||e.name,checkedAt:new Date().toISOString()};}
}
async function worker(platform){const q=queues.get(platform);while(q?.length&&!stopping){const r=q.shift(),result=await check(r);done.set(r._id,result);await fs.appendFile(dir+'/source-checks.jsonl',JSON.stringify(result)+'\n');if(done.size%100===0){const summary={checked:done.size,total:rows.length,decisions:Object.fromEntries([...new Set([...done.values()].map(x=>x.decision))].map(k=>[k,[...done.values()].filter(x=>x.decision===k).length]))};await fs.writeFile(dir+'/source-audit-progress.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));}}}
await Promise.all([...queues.keys()].flatMap(p=>Array.from({length:['facebook','tiktok','instagram','threads','gg reviews'].includes(p)?2:6},()=>worker(p))));
const results=[...done.values()];await fs.writeFile(dir+'/source-checks.json',JSON.stringify(results,null,2));console.log(JSON.stringify({checked:results.length,total:rows.length,finished:!stopping}));
