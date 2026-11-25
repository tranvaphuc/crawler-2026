import {articleKey,nativeKey} from './identity.mjs';
// Refresh HTTP observations without discarding qualifications or admissions.
export function refreshCategoryAuditCheckpoint(db,{hintsOnly=false,knownSeedKeys=[],now=Date.now()}={}){
 if(!hintsOnly)return {homepages:0,unconfirmed:0};
 const homepages=db.prepare("UPDATE pages SET state='pending' WHERE origin='configured'").run().changes;
 const unconfirmed=db.prepare("UPDATE pages SET state='pending' WHERE origin='discovered' AND state='done' AND coalesce(checked_at,0)<? AND key NOT IN (SELECT value FROM json_each(?))").run(now-86400000,JSON.stringify([...knownSeedKeys])).changes;
 return {homepages,unconfirmed};
}
export function reusablePrimaryArticleProof(row){return !!row.cached_urls&&row.prior_reason==='awaiting_two_verified_editorial_articles'&&row.proof_checked_at>=row.checked_at;}
export function distinctPrimaryArticleUrls(articles){const rows=new Map();for(const a of articles||[])try{const url=typeof a==='string'?a:a.url;const key=articleKey(url);if(!rows.has(key))rows.set(key,url);}catch{}return [...rows.values()];}
export function verifiedCategoryArticleCount(urls,source,registry,read){
 const identities=new Set();for(const url of distinctPrimaryArticleUrls(urls)){const owner=registry.byUrl(url);if(!owner||owner.domain!==source.domain&&owner.config.siteName!==source.config.siteName)continue;const row=read(articleKey(url));if(row?.parse_status!=='done')continue;identities.add(row.es_id?row.es_index+'|'+row.es_id:nativeKey(url,owner.config)||articleKey(url));}return identities.size;
}
