import fs from 'node:fs/promises';
const root='outputs/source-audit-final-recheck-2026-10-22/',follow='outputs/source-audit-followup-2026-10-22/';
const base=JSON.parse(await fs.readFile(follow+'sources-base.json','utf8'));
const byKey=new Map(base.flatMap((r,index)=>r.keys.map(k=>[k,{...r,index}])));
const jsonl=async name=>{try{return(await fs.readFile(root+name,'utf8')).split('\n').filter(Boolean).map(JSON.parse);}catch(e){if(e.code==='ENOENT')return [];throw e;}};
const native=new Map((await jsonl('web-browser-results.jsonl')).map(r=>[r.domain,r]));
const http=new Map((await jsonl('web-http-results.jsonl')).map(r=>[r.domain,r]));
const https=new Map((await jsonl('web-https-results.jsonl')).map(r=>[r.domain,r]));
const fast=new Map((await jsonl('web-fast-results.jsonl')).map(r=>[r.domain,r]));
const publicRows=(await Promise.all((await fs.readdir(root)).filter(n=>/^web-public-batch-\d+\.json$/.test(n)).sort().map(async n=>JSON.parse(await fs.readFile(root+n,'utf8'))))).flat();
try{publicRows.push(...JSON.parse(await fs.readFile(root+'web-public-retry-results.json','utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
const pub=new Map(publicRows.map(r=>[r.domain,r]));
const seen=new Set((await fs.readFile(follow+'browser-updates.jsonl','utf8')).split('\n').filter(Boolean).map(l=>{const r=JSON.parse(l);return r.index+'|'+r.checkedAt;}));
const targets=JSON.parse(await fs.readFile(root+'web.json','utf8'));let added=0;const combined=[];
const noQuery=s=>String(s||'').replace(/https?:\/\/[^\s;]+/g,raw=>{try{const u=new URL(raw);u.search='';u.hash='';return u.href;}catch{return raw;}});
for(const r of targets){const n=native.get(r.domain),plain=http.get(r.domain),secure=https.get(r.domain),fresh=fast.get(r.domain),h=fresh?.status==='die'||fresh?.status==='live'?fresh:secure?.status==='live'?secure:plain?.status==='live'?plain:fresh||secure||plain,p=pub.get(r.domain);if(!n&&!h&&!p)continue;
 const methods=[n?'Chrome':null,plain?'HTTP trực tiếp':null,secure?'HTTPS trực tiếp':null,p&&p.category!=='not_returned'?'Công cụ web công khai':null].filter(Boolean);
 let status=h?.status||n?.status||'chưa xác định';
 if(n?.status==='live'&&h?.status==='die')status='chưa xác định';
 else if(n?.status==='live'&&h?.status!=='die')status='live';
 let note=[n?'Chrome: '+n.note:null,plain?'HTTP gốc: '+plain.note:null,secure?'HTTPS: '+secure.note:null,fresh?'HTTPS với DNS riêng cho request: '+fresh.note:null,p?.category==='content_candidate'?`Công cụ web có nội dung; thời điểm crawl ${p.evidence.crawled||'không rõ'}, không dùng bản lưu để thay thế kiểm tra HTTP hiện tại.`:null,p?.evidence?.redirect?'Chuyển hướng đã quan sát: '+noQuery(p.evidence.redirect):null].filter(Boolean).join(' | ');
 if(n?.status==='live'&&h?.status==='die')note+=' | Bằng chứng Chrome và HTTP mâu thuẫn; cần đối chiếu, chưa kết luận live/die.';
 const stamp=h?.checkedAt||n?.browserCheckedAt||p?.checkedAt;
 let canonicalUrl=null;if(h?.status==='live'&&h.evidence?.finalUrl){const u=new URL(h.evidence.finalUrl);if(u.hostname.replace(/^www\./,'')===r.domain)canonicalUrl=u.origin+'/';}
 const row={...r,status,link:canonicalUrl||r.link,note:noQuery(note),checkedAt:stamp,methodsChecked:methods};combined.push(row);
 const groups=new Map();for(const k of r.keys){const b=byKey.get(k);if(!b)continue;const g=groups.get(b.index)||{b,keys:[]};g.keys.push(k);groups.set(b.index,g);}
 for(const [index,{b,keys}] of groups){if(seen.has(index+'|'+stamp))continue;const update={index,channel:b.channel,keys,originalLink:b.originalLink,status,note:row.note,checkedAt:stamp,identityEvidence:'Checked via '+methods.join(', ')+'; evidence stored in final-recheck output'};if(canonicalUrl)update.url=canonicalUrl;
  await fs.appendFile(follow+'browser-updates.jsonl',JSON.stringify(update)+'\n');seen.add(index+'|'+stamp);added++;
 }
}
await fs.writeFile(root+'web-combined-results.json',JSON.stringify(combined,null,2));
const summary={updatedAt:new Date().toISOString(),targetDomains:targets.length,attemptedDomains:combined.length,nativeChromeChecked:native.size,freshHttpChecked:http.size,freshHttpsChecked:https.size,fastDnsChecked:fast.size,publicToolReturned:[...pub.values()].filter(x=>x.category!=='not_returned').length,counts:combined.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),remaining:targets.length-combined.length};
await fs.writeFile(root+'web-combined-progress.json',JSON.stringify(summary,null,2));console.log(JSON.stringify({...summary,updatesAdded:added}));
