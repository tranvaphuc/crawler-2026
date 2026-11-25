import {requestKey,urlAliases} from './identity.mjs';

// One manual retry per reviewed snapshot; terminal/newer records are preserved.
export function applyFailedReviewBatch(db,rows,{snapshotAt,reviewedAt=Date.now()}={}) {
  if(!Number.isFinite(snapshotAt)||!Number.isFinite(reviewedAt)||reviewedAt<snapshotAt)throw Error('INVALID_RECOVERY_TIMESTAMP');
  const result={requeued:0,excluded:0,unchanged:0};
  const current=db.prepare('SELECT parse_status,error,reviewed_at FROM article_links WHERE parse_key=?');
  const update=db.prepare("UPDATE article_links SET parse_status=?,error=?,reviewed_at=? WHERE parse_key=? AND parse_status='fail'");
  const clear=db.prepare("DELETE FROM url_failures WHERE url_key=? AND (?='verified' OR role='article')");
  const catalog=db.prepare("UPDATE article_catalog SET status='done',reason=?,processed_at=? WHERE url_key=?");
  const sample=db.prepare("DELETE FROM review_samples WHERE site=? AND url IN (?,?) AND kind='fail'");
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const row of rows){
      if(!['verified','excluded'].includes(row.outcome)){result.unchanged++;continue;}
      const record=current.get(row.parse_key);
      if(!record||record.parse_status!=='fail'||record.error!==row.old_reason||(record.reviewed_at||0)>=snapshotAt){result.unchanged++;continue;}
      const key=requestKey(row.url);
      if(row.outcome==='excluded'){
        if(!row.reason?.startsWith('non_article:'))throw Error('NON_ARTICLE_EVIDENCE_REQUIRED');
        update.run('skipped',row.reason,reviewedAt,row.parse_key);catalog.run(row.reason,reviewedAt,key);sample.run(row.site,row.url,key);result.excluded++;
      }else{update.run('pending',null,reviewedAt,row.parse_key);result.requeued++;}
      // A successful redirect may previously have failed under its www/HTTPS alias.
      // These aliases have the same article key, rather than clearing a whole site.
      for(const alias of new Set(urlAliases(row.url).map(requestKey)))clear.run(alias,row.outcome);
      if(row.outcome==='verified')for(const url of row.verifiedRequestUrls||[])clear.run(requestKey(url),'verified');
    }
    db.exec('COMMIT');return result;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
