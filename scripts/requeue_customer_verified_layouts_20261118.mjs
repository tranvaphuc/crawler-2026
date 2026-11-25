import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {articleKey,requestKey} from '../src/newsFlow/identity.mjs';
const root='outputs/customer-layout-repair-20261118';
const report=JSON.parse(await fs.readFile(root+'/recheck/results.json'));
const additional=JSON.parse(await fs.readFile(root+'/vov-alias-proof/pipeline-results.json'));
const urls=[...new Set([...report.rows.filter(r=>r.reason==='verified_outbox').map(r=>r.url),...additional.rows.filter(r=>r.reason==='verified_outbox').map(r=>r.url)])];
const db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite');db.exec('PRAGMA busy_timeout=10000');
const before=urls.map(url=>({url,article:db.prepare('SELECT * FROM article_links WHERE parse_key=?').get(articleKey(url))||null,failure:db.prepare('SELECT * FROM url_failures WHERE url_key=?').get(requestKey(url))||null}));
await fs.writeFile('/var/lib/news-flow/customer-layout-repair-20261118/verified-requeue-before.json',JSON.stringify(before,null,2),{flag:'wx',mode:0o600});
const rows=[];db.exec('BEGIN IMMEDIATE');
try{
 for(const r of before){
  if(r.article?.parse_status!=='fail'){rows.push({url:r.url,action:'unchanged',state:r.article?.parse_status||'missing'});continue;}
  const changed=db.prepare("UPDATE article_links SET parse_status='pending',error=NULL,reviewed_at=? WHERE parse_key=? AND parse_status='fail' AND error IS ?").run(Date.now(),articleKey(r.url),r.article.error).changes;
  if(changed)db.prepare("DELETE FROM url_failures WHERE url_key=? AND role='article'").run(requestKey(r.url));
  rows.push({url:r.url,action:changed?'requeued_normal_freshness':'concurrently_changed'});
 }
 db.exec('COMMIT');
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
await fs.writeFile(root+'/verified-requeue.json',JSON.stringify({checkedAt:new Date().toISOString(),candidateUrls:urls.length,rows,paidAiCalls:0},null,2));
console.log(JSON.stringify({candidates:urls.length,requeued:rows.filter(r=>r.action==='requeued_normal_freshness').length,unchanged:rows.filter(r=>r.action==='unchanged').length}));
