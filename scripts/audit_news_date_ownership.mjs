import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import * as cheerio from 'cheerio';
import {newsDateOwnershipIssue} from '../src/web/newsDateOwnership.mjs';
import {parsePublishedDate} from '../src/web/configurableNewsParser.mjs';

const root='outputs/news-full-deep-audit-544-2026-11-10/live/sites';
const report={scope:'Saved HTTP article samples; ownership checks only, not full semantic date certification',sites:0,samples:0,unavailable:0,findings:[]};
for(const domain of fs.readdirSync(root)){
 const resultPath=path.join(root,domain,'result.json'),configPath='config/web-sources/news/'+domain+'.json';
 if(!fs.existsSync(resultPath)||!fs.existsSync(configPath))continue;
 report.sites++;
 const result=JSON.parse(fs.readFileSync(resultPath)),config=JSON.parse(fs.readFileSync(configPath));
 for(const a of (result.articles||[]).filter(a=>a.htmlPath)){
  const htmlPath=path.join(root,domain,path.basename(a.htmlPath));
  if(!fs.existsSync(htmlPath)){report.unavailable++;continue;}
  const $=cheerio.load(gunzipSync(fs.readFileSync(htmlPath)).toString());report.samples++;
  for(const [variant,cfg] of [config,...(config.variants||[]).map(v=>({...config,...v}))].entries()){
   const setting=cfg.publishedDate;if(setting?.strategy!=='selector')continue;
   let node;try{node=$(setting.selector).eq(setting.index||0);}catch{continue;}
   const raw=setting.attribute?node.attr(setting.attribute):node.attr('content')||node.attr('datetime')||node.text();
   if(!parsePublishedDate(raw,cfg.timezone,cfg.dateOrder,cfg.clockFormat))continue;
   const issue=newsDateOwnershipIssue($,node,a.url);
   if(issue)report.findings.push({domain,url:a.url,variant,selector:setting.selector,raw:String(raw).trim().slice(0,180),issue,htmlPath});
  }
 }
}
fs.mkdirSync('outputs/news-time-review-2026-11-16',{recursive:true});
fs.writeFileSync('outputs/news-time-review-2026-11-16/ownership-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,findings:report.findings.length,affectedSites:[...new Set(report.findings.map(f=>f.domain))]}));
