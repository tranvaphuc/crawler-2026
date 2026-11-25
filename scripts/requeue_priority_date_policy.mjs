import fs from 'node:fs/promises';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {urlAliases,requestKey} from '../src/newsFlow/identity.mjs';
const root='outputs/news-priority-sites-2026-11-16',sites=JSON.parse(await fs.readFile(root+'/candidates.json','utf8')).map(s=>s.domain),registry=await loadNewsRegistry(),state=await ThreeFlowState.open('/var/lib/news-flow/news-flow-runtime/write.sqlite'),db=state.db;
const marker='priority_user_date_policy_retry_20261116_v1',eligible=new Set(['NEWS_PUBLICATION_CLOCK_MISSING','NEWS_PUBLICATION_TIMEZONE_UNCONFIRMED','NEWS_PUBLICATION_PRECISION_UNCONFIRMED','NEWS_PUBLICATION_OWNERSHIP_UNCONFIRMED','NEWS_PUBLICATION_FIELD_NOT_ORIGINAL']);
try{
 state.loadOverlays(registry);
 if(db.prepare('SELECT 1 FROM flow_meta WHERE key=?').get(marker)){console.log('DATE_POLICY_RETRY_ALREADY_APPLIED');process.exitCode=0;}
 else {
  const result={at:new Date().toISOString(),requeued:0,nonArticlesSkipped:0,activePreserved:0,bySite:{},byReason:{},queueReset:false,esDirectWrites:false,paidAiCalls:0};
  state.tx(()=>{
   const before=db.prepare('SELECT * FROM ai_usage').all();
   for(const site of sites){if(!registry.sources.has(site))continue;
    for(const row of db.prepare("SELECT * FROM article_links WHERE site=? AND parse_status='fail'").all(site)){
     if(!eligible.has(row.error))continue;
     if(db.prepare("SELECT 1 FROM tasks WHERE id=? AND state IN ('pending','running')").get(row.task_id)){result.activePreserved++;continue;}
     const rejection=state.articleRejection(row.url,site);
     if(rejection){result.nonArticlesSkipped+=db.prepare("UPDATE article_links SET parse_status='skipped',error=?,reviewed_at=? WHERE parse_key=? AND parse_status='fail'").run('non_article:'+rejection,Date.now(),row.parse_key).changes;continue;}
     for(const alias of urlAliases(row.url))db.prepare("DELETE FROM url_failures WHERE url_key=? AND role='article'").run(requestKey(alias));
     const changed=db.prepare("UPDATE article_links SET parse_status='pending',error=NULL,task_id=NULL,reviewed_at=? WHERE parse_key=? AND parse_status='fail'").run(Date.now(),row.parse_key).changes;
     result.requeued+=changed;result.bySite[site]=(result.bySite[site]||0)+changed;result.byReason[row.error]=(result.byReason[row.error]||0)+changed;
    }
   }
   const after=db.prepare('SELECT * FROM ai_usage').all();if(before.some(b=>!after.some(a=>a.day===b.day&&a.calls>=b.calls&&a.usd+1e-9>=b.usd)))throw Error('AI_LEDGER_NOT_PRESERVED');
   db.prepare('INSERT INTO flow_meta(key,value) VALUES(?,?)').run(marker,JSON.stringify(result));
  });await fs.writeFile(root+'/date-policy-retry.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }
}finally{state.close();}
