import fs from 'node:fs/promises';import path from 'node:path';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
const root=path.resolve(process.argv[2]||'outputs/news-time-review-2026-11-16/news-time-strict-20261116'),out=path.resolve(process.argv[3]||'outputs/news-time-review-2026-11-16/strict-live-sample-audit');
await fs.mkdir(out,{recursive:true});const configs=JSON.parse(await fs.readFile(path.join(root,'configs.json'),'utf8')),samples=JSON.parse(await fs.readFile(path.join(root,'samples.json'),'utf8')),pool=new NewsRepairPool(4,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const sites=new Map(configs.map(s=>[s.domain,{domain:s.domain,goodSamples:0,pass:0,rejected:0,checks:[]}])),results=[];let i=0;
async function run(){while(i<samples.length){const sample=samples[i++],row=configs.find(r=>r.domain===sample.site);if(!row)continue;
 const config={...row.config,publicationValidationPolicy:'strict_native_publication_v1'};
 // Retain the exact live config except for the three observed date corrections.
 const selectors={'suckhoecong.vn':'.info-author > ul > li:first-child','thuongtruong24h.vn':'.dt-news__body .tacgia-area .datetime','vietq.vn':'article.detail-art > .datetimeup'};
 if(selectors[sample.site]){config.publishedDate={strategy:'selector',selector:selectors[sample.site]};config.variants=(config.variants||[]).map(v=>({...v,publishedDate:config.publishedDate}));}
 const r=await pool.run({sample:{domain:sample.site,url:sample.url,htmlPath:path.join(root,sample.file),kind:'article'},config,learn:false});
 const check={site:sample.site,url:sample.url,previousKind:sample.kind,error:r.error||null,quality:r.quality||[],proof:r.parsed?.extracted.publicationProof||r.publicationProof||null,date:r.parsed?._source.publishedDate||null};
 const s=sites.get(sample.site);if(sample.kind==='good')s.goodSamples++;if(!check.error&&check.proof?.ok&&!check.quality.length)s.pass++;else s.rejected++;s.checks.push(check);results.push(check);
 if(results.length%100===0){await fs.writeFile(path.join(out,'progress.json'),JSON.stringify({done:results.length,total:samples.length}));console.log(JSON.stringify({done:results.length,total:samples.length}));}
}}
try{await Promise.all(Array.from({length:4},run));}finally{await pool.close();}
const all=[...sites.values()],summary={sites:all.length,samples:results.length,passedSamples:all.reduce((n,s)=>n+s.pass,0),rejectedSamples:all.reduce((n,s)=>n+s.rejected,0),sitesWithPassingSamples:all.filter(s=>s.pass).length,sitesWithoutPassingSamples:all.filter(s=>!s.pass).length,noSavedSamples:all.filter(s=>!s.checks.length).length,scope:'Exact VPS registry/review samples; positive original publication ownership and timezone proof; no paid AI; not full-site certification'};
await fs.writeFile(path.join(out,'sites.json'),JSON.stringify(all,null,2));await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
