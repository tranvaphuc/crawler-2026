import fs from 'node:fs/promises';
import path from 'node:path';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {currentAuditGate} from './news_current_audit_gate.mjs';
const root=path.resolve('outputs/news-all-sites-2026-11-15');
const sites=JSON.parse(await fs.readFile(path.join(root,'sites.json')));
const samples=JSON.parse(await fs.readFile(path.join(root,'runtime-samples.json')));
const registry=await loadNewsRegistry(),pool=new NewsRepairPool(8,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
let merged=0,checked=0;
try {
  for(const site of sites){
    const file=path.join(root,'live/sites',site.domain,'result.json');
    const record=JSON.parse(await fs.readFile(file));
    const config=JSON.parse(await fs.readFile(site.configurationFile));
    for(const sample of samples.filter(s=>s.site===site.domain)){
      if(record.articles.some(a=>a.url===sample.url))continue;
      const audit=currentAuditGate(await pool.run({sample:{domain:site.domain,url:sample.url,htmlPath:sample.htmlPath,kind:'article'},config,learn:true}),config,registry,site.domain);
      record.articles.push({url:sample.url,family:'runtime_sample',foundOn:[],origin:'runtime_saved_'+sample.kind,previousRuntimeReason:sample.reason,htmlPath:sample.htmlPath,attempted:true,...audit,state:audit.error?.startsWith('non_news_document:')?'confirmed_non_article':audit.error?'extraction_unconfirmed':audit.quality?.length?'content_integrity_review':'parsed'});
      merged++;
    }
    record.runtimeSamplesMergedAt=new Date().toISOString();
    await fs.writeFile(file+'.tmp',JSON.stringify(record));await fs.rename(file+'.tmp',file);
    checked++;
    if(checked%50===0)console.log(JSON.stringify({checked,merged}));
  }
} finally {await pool.close();}
console.log(JSON.stringify({checked,merged,paidAiCalls:0}));
