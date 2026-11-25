import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {requestKey} from '../src/newsFlow/identity.mjs';
const root='outputs/news-all-sites-2026-11-15';
const changes=JSON.parse(await fs.readFile(root+'/final/changes.json'));
const sites=[...new Set(['arttimes.vn',...changes.map(c=>c.domain)])];
const db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite');
db.exec('PRAGMA busy_timeout=30000');
const before=db.prepare('SELECT * FROM ai_usage ORDER BY day').all();
const requeued=[];
try {
  db.exec('BEGIN IMMEDIATE');
  for(const site of sites){
    const rows=db.prepare("SELECT parse_key,url FROM article_links WHERE site=? AND parse_status='fail'").all(site);
    const clear=db.prepare("DELETE FROM url_failures WHERE role='article' AND url_key=?");
    for(const row of rows)clear.run(requestKey(row.url));
    const n=db.prepare("UPDATE article_links SET parse_status='pending',error=NULL,reviewed_at=? WHERE site=? AND parse_status='fail'").run(Date.now(),site).changes;
    requeued.push({site,links:n});
  }
  const after=db.prepare('SELECT * FROM ai_usage ORDER BY day').all();
  if(JSON.stringify(before)!==JSON.stringify(after))throw Error('AI_LEDGER_CHANGED');
  db.prepare('INSERT OR REPLACE INTO flow_meta(key,value) VALUES(?,?)').run('manual_site_audit_20261115',JSON.stringify({at:new Date().toISOString(),requeued,paidAiCalls:0}));
  db.exec('COMMIT');
}catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
await fs.writeFile(root+'/reactivation.json',JSON.stringify({requeued,aiUsagePreserved:true,paidAiCalls:0},null,2));
console.log(JSON.stringify({requeued,aiUsagePreserved:true}));
