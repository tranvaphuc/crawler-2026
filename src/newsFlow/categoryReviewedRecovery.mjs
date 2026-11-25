import {randomUUID} from 'node:crypto';import {articleKey,requestKey} from './identity.mjs';import {NewsEs5Sink} from './es5.mjs';import {applyFailedReviewBatch} from './manualFailedRecovery.mjs';
export const categoryTransientReasons=['NEWS_NETWORK_POOL_CLOSED','NEWS_NETWORK_POOL_FAILED','NEWS_NETWORK_WORKER_FAILED','service_interrupted_no_retry','request_deadline_exceeded','ECONNRESET','rate_limited'];
export function categoryReviewedPayloadVerified(row,payload){try{const {doc,config,aliases}=payload;return categoryTransientReasons.includes(row.old_reason)&&aliases.some(url=>articleKey(url)===row.parse_key)&&/^[a-f0-9]{32}$/.test(doc?._id||'')&&/^master\d{6}$/.test(doc?._index||'')&&NewsEs5Sink.prototype.publicationVerified.call({requirePublicationProof:true},doc,config);}catch{return false;}}
// A fresh unchanged full-processor result goes through the normal outbox once.
// If another job wins admission after review, that job retains ownership.
export function activateCategoryReviewedDocument(state,row,payload,{snapshotAt,reviewedAt=Date.now()}={}){
 const {doc,config,aliases}=payload;
 if(!categoryReviewedPayloadVerified(row,payload))throw Error('CATEGORY_REVIEW_PUBLICATION_NOT_VERIFIED');
 const newer=state.db.prepare('SELECT last_at FROM url_failures WHERE url_key=?').get(requestKey(row.url));if(newer?.last_at>snapshotAt)return {requeued:0,offered:0,unchanged:1};
 const result=applyFailedReviewBatch(state.db,[{...row,outcome:'verified',verifiedRequestUrls:payload.verifiedRequestUrls||[]}],{snapshotAt,reviewedAt});let offered=0;
 if(result.requeued)state.tx(()=>{
  const current=state.db.prepare('SELECT parse_status,reviewed_at,task_id FROM article_links WHERE parse_key=?').get(row.parse_key);if(current?.parse_status!=='pending'||current.reviewed_at!==reviewedAt||current.task_id&&state.db.prepare("SELECT 1 FROM tasks WHERE id=? AND state IN ('pending','running')").get(current.task_id))return;
  const cycle='manual-category-reviewed-'+randomUUID();state.cycle(cycle);const id=state.db.prepare("INSERT INTO tasks(cycle,url,url_key,site,role,priority,state,reason,created) VALUES(?,?,?,?,'article',100,'running','manual_refresh',?)").run(cycle,row.url,requestKey(row.url),row.site,reviewedAt).lastInsertRowid;state.db.prepare("UPDATE article_links SET task_id=?,parse_status='running' WHERE parse_key=?").run(id,row.parse_key);const task=state.db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
  state.completeVerified(task,doc,config,aliases,{cycle,site:config.siteName,url:doc._source.url,id:doc._id,index:doc._index,publishedDate:doc._source.publishedDate,manualCategoryReview:true},{sample:null});
  for(const hint of payload.sectionHints||[]){const source=state.articleSources?.get(hint.site);if(source?.config.siteName===config.siteName)state.rememberCategoryHints(source,[{url:hint.url}],hint.parent||row.url);}offered=1;
 },'activate_reviewed_category_document');
 return {...result,offered};
}
