import fs from 'node:fs/promises';
import dns from 'node:dns';
import {fetchPage,decode} from './source_audit_metadata.mjs';
const root='outputs/source-audit-final-recheck-2026-10-22/';
const fastDns=process.argv.includes('--fast-dns');
const secure=fastDns||process.argv.includes('--https');
const resultsName=fastDns?'web-fast-results.jsonl':secure?'web-https-results.jsonl':'web-http-results.jsonl';
const progressName=fastDns?'web-fast-progress.json':secure?'web-https-progress.json':'web-http-progress.json';
const resolver=fastDns?new dns.Resolver({timeout:2500,tries:1}):null;
const lookup=resolver?(host,options,callback)=>resolver.resolve4(host,(error,addresses)=>{if(error)return callback(error);if(options?.all)return callback(null,addresses.map(address=>({address,family:4})));callback(null,addresses[0],4);}):undefined;
const targets=JSON.parse(await fs.readFile(root+'web.json','utf8'));
let prior=[];try{prior=(await fs.readFile(root+resultsName,'utf8')).split('\n').filter(Boolean).map(JSON.parse);}catch(e){if(e.code!=='ENOENT')throw e;}
if(secure&&!fastDns){const have=new Set(prior.map(r=>r.domain)),links=new Map(targets.map(r=>[r.domain,r.link]));let old=[];try{old=(await fs.readFile(root+'web-http-results.jsonl','utf8')).split('\n').filter(Boolean).map(JSON.parse);}catch{}for(const r of old){if(have.has(r.domain)||!/^https:/.test(links.get(r.domain)||''))continue;prior.push(r);have.add(r.domain);await fs.appendFile(root+resultsName,JSON.stringify(r)+'\n');}}
const done=new Set(prior.map(r=>r.domain)),queue=targets.filter(r=>!done.has(r.domain));
const save=async()=>fs.writeFile(root+progressName,JSON.stringify({updatedAt:new Date().toISOString(),pid:process.pid,checked:done.size,total:targets.length,remaining:targets.length-done.size},null,2));
async function worker(){while(queue.length){const r=queue.shift();let status='chưa xác định',note='',evidence={};
 try{const requested=secure?r.link.replace(/^http:/,'https:'):r.link;const p=await fetchPage(requested,{timeout:10000,maxBytes:900000,redirects:2,lookup});const title=decode(p.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/\s+/g,' ').trim();
  const finalHost=new URL(p.url).hostname.toLowerCase().replace(/^www\./,'');
  evidence={method:'fresh unauthenticated HTTP GET',requestedUrl:requested,httpStatus:p.status,title:title.slice(0,250),finalUrl:p.url,bytes:p.body.length};
  if([401,403,429,999].includes(p.status))note=`Truy cập công khai HTTP ${p.status}: bị chặn/cần xác thực; chưa kết luận die.`;
  else if([404,410].includes(p.status)&&finalHost===r.domain){status='die';note=`Trang gốc trả HTTP ${p.status} khi kiểm tra trực tiếp; trạng thái áp dụng domain/URL này.`;}
  else if(p.status===200&&/captcha|just a moment|access denied|attention required|checking your browser|bot verification|welcome to nginx|IIS Windows Server|domain.{0,20}for sale|buy this domain|parked domain/i.test(title+' '+p.body.slice(0,5000)))note='HTTP 200 nhưng trả trang chặn/xác minh/parking/trang mặc định; chưa xác minh nội dung nguồn.';
  else if(p.status===200&&finalHost!==r.domain)note=`URL chuyển hướng sang domain khác (${finalHost}); đã tải được trang đích nhưng chưa đủ bằng chứng đồng nhất nguồn gốc. Trang đích: ${p.url}`;
  else if(p.status===200&&title&&p.body.length>500){status='live';note='Đã kiểm tra trực tiếp HTTP 200, có tiêu đề và nội dung HTML thuộc đúng domain; '+(title?`tiêu đề: ${title.slice(0,160)}`:'');}
  else note=`Truy cập công khai HTTP ${p.status}, chưa đủ nội dung xác minh nguồn.`;
 }catch(e){evidence={method:'fresh unauthenticated HTTP GET',error:e.code||e.name};note=`Đã thử truy cập công khai: ${e.code||e.name}; chưa kết luận nguồn die.`;}
 const result={domain:r.domain,keys:r.keys,status,note,checkedAt:new Date().toISOString(),identityEvidence:'Fresh public HTTP check; Chrome/public web evidence retained separately',evidence};
 await fs.appendFile(root+resultsName,JSON.stringify(result)+'\n');done.add(r.domain);if(done.size%50===0)await save();
}}
await save();await Promise.all(Array.from({length:40},worker));await save();console.log(JSON.stringify({checked:done.size,total:targets.length,finished:true}));
