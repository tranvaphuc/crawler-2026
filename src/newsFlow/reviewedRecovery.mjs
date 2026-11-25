import {articleKey,requestKey,urlAliases} from './identity.mjs';
import {publicationHistoryUnconfirmed} from '../web/newsOriginalPublicationContract.mjs';

// Stage only a successful frozen review. The ordinary importer still owns ES
// writes; concurrent collector decisions and newer failures take precedence.
export function stageReviewedRecovery(state,row,payload,{snapshotAt}={}){
 if(!Number.isFinite(snapshotAt)||!Number.isFinite(row.checked_at)||row.checked_at<snapshotAt)throw Error('RECOVERY_INVALID_REVIEW_TIME');
 if(!['verified','excluded'].includes(row.outcome))throw Error('RECOVERY_NOT_VERIFIED');
 if(row.outcome==='verified'&&(!payload?.doc?._id||!payload.config||!Array.isArray(payload.aliases)||!payload.aliases.includes(row.url)))throw Error('RECOVERY_PAYLOAD_INVALID');
 if(row.outcome==='excluded'&&!row.reason?.startsWith('non_article:'))throw Error('RECOVERY_EXCLUSION_UNPROVEN');
 if(row.outcome==='verified'&&(publicationHistoryUnconfirmed(row.url,payload.config)||publicationHistoryUnconfirmed(row.url,state.articleSources?.get(row.site)?.config)||publicationHistoryUnconfirmed(payload.doc._source?.url,payload.config)))return {status:'history_quarantine'};
 return state.tx(()=>{
  const db=state.db,current=db.prepare('SELECT * FROM article_links WHERE parse_key=?').get(row.parse_key);
  if(!current||current.parse_status!=='fail'||current.error!==row.old_reason||(current.reviewed_at||0)!==(row.old_reviewed_at||0)||current.config_version!==row.old_config_version)return {status:'concurrent_change'};
  const aliases=new Set([row.url,...payload?.aliases||[]]);
  const keys=new Set([...aliases].flatMap(urlAliases).map(requestKey));
  for(const key of keys){
   if(db.prepare('SELECT 1 FROM url_failures WHERE url_key=? AND last_at>?').get(key,row.checked_at))return {status:'newer_failure'};
  }
  for(const url of aliases){
   const other=db.prepare('SELECT * FROM article_links WHERE parse_key=?').get(articleKey(url));
   const unchangedDone=other?.parse_status==='done'&&other.error===null&&other.config_version===(state.configVersions.get(payload?.config?.siteName)||'');
   if(other&&other.parse_key!==row.parse_key&&(['queued','running','pending'].includes(other.parse_status)||(other.reviewed_at||0)>=snapshotAt&&!unchangedDone))return {status:'alias_concurrent_change'};
  }
  if(row.outcome==='verified'){
   state.offer(payload.doc,payload.config,[...aliases]);
   state.remember({url:row.url,site:row.site},'done','verified_outbox');
   db.prepare("UPDATE article_links SET parse_status='done',error=NULL,reviewed_at=?,config_version=? WHERE parse_key=?").run(row.checked_at,state.configVersions.get(row.site)||'',row.parse_key);
  }else{
   db.prepare("UPDATE article_links SET parse_status='skipped',error=?,reviewed_at=? WHERE parse_key=?").run(row.reason,row.checked_at,row.parse_key);
   state.remember({url:row.url,site:row.site},'done',row.reason);
  }
  const clear=db.prepare("DELETE FROM url_failures WHERE url_key=? AND last_at<=? AND (?='verified' OR role='article')");
  for(const key of keys)clear.run(key,row.checked_at,row.outcome);
  state.event('manual_frozen_recovery',{site:row.site,url:row.url,outcome:row.outcome,evidenceFile:row.evidence_file,checkedAt:row.checked_at,paidAiCalls:0});
  return {status:row.outcome==='verified'?'staged':'excluded',id:payload?.doc?._id||null};
 });
}

// Existing minute-precision documents can legitimately lack native seconds.
// A different minute is retained for review rather than rewriting history.
export function recoveryPublicationConflict(expected,stored){
 if(!/T\d\d:\d\d:/.test(expected||'')||!/T\d\d:\d\d:/.test(stored||''))return false;
 const a=Date.parse(expected),b=Date.parse(stored);
 return Number.isFinite(a)&&Number.isFinite(b)&&Math.floor(a/60000)!==Math.floor(b/60000);
}
