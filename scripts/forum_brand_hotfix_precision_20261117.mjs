import {forumIdentity} from '../src/forumFlow/es5.mjs';import {forumTime} from '../src/forumFlow/time.mjs';
export function confirmLegacyMinuteParent({existing,doc,proof,fresh,legacy,site,nativePostId}){
 const field=legacy.comment_processor?.created_time;
 if(site.domain!=='voz.vn'||legacy.site_name!=='voz.vn'||field?.attribute!=='title'||field.format!=='DD/MM/YYYY HH:mm A'||doc._type!=='forumTopic'||existing._type!=='forumTopic')throw Error('LEGACY_MINUTE_RULE_NOT_PROVEN');
 if(existing._source.siteName!=='voz.vn'||forumIdentity(existing._source.url,'forumTopic',site)!==forumIdentity(doc._source.url,'forumTopic',site)||String(fresh.nativePostId)!==String(nativePostId))throw Error('LEGACY_PARENT_IDENTITY_MISMATCH');
 const original=forumTime(proof.time.raw,{kind:proof.time.kind,source:proof.time.source});
 if(original.publishedDate!==doc._source.publishedDate||fresh.publishedDate!==original.publishedDate||fresh.timeEvidence?.publishedDate!==original.publishedDate)throw Error('LEGACY_FRESH_CLOCK_MISMATCH');
 const actual=Date.parse(existing._source.publishedDate),precise=Date.parse(original.publishedDate);
 if(!Number.isFinite(actual)||actual%60000!==0||Math.floor(actual/60000)!==Math.floor(precise/60000))throw Error('LEGACY_MINUTE_CLOCK_MISMATCH');
 return {precision:'minute',forumPublished:original.publishedDate,esPublished:existing._source.publishedDate,secondsTruncated:(precise-actual)/1000,legacyFormat:field.format};
}
