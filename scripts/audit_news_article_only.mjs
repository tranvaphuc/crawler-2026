import fs from 'node:fs';import readline from 'node:readline';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {newsArticleRejection} from '../src/web/newsArticleAdmission.mjs';
const registry=await loadNewsRegistry(),report={sitesConfigured:registry.sources.size,backlogLinks:0,rejected:0,bySite:{},validationRejected:[]};
for(const source of registry.sources.values()){
 for(const u of source.config.validation?.sampleUrls||[]){const reason=newsArticleRejection(u,source);if(reason)report.validationRejected.push({site:source.domain,url:u,reason});}
}
for await(const line of readline.createInterface({input:fs.createReadStream('outputs/news-backlog-2026-11-15/backlog.jsonl')})){
 if(!line.trim())continue;const [site,url,state]=JSON.parse(line),reason=newsArticleRejection(url,registry.sources.get(site)||{domain:site});report.backlogLinks++;
 const s=report.bySite[site]??={total:0,rejected:0,reasons:{},samples:[]};s.total++;
 if(reason){report.rejected++;s.rejected++;s.reasons[reason]=(s.reasons[reason]||0)+1;if(s.samples.length<5)s.samples.push({url,reason,state});}
}
fs.writeFileSync('outputs/news-article-only-2026-11-15/url-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({configured:report.sitesConfigured,links:report.backlogLinks,rejected:report.rejected,validationRejected:report.validationRejected,top:Object.entries(report.bySite).filter(([s,v])=>v.rejected).sort((a,b)=>b[1].rejected-a[1].rejected).slice(0,20).map(([site,v])=>({site,rejected:v.rejected,reasons:v.reasons}))},null,2));

