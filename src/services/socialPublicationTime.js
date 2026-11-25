import {estimateYoutubeCommentDate} from './youtubeCommentDates.js';
const fields=['taken_at','taken_at_timestamp','creation_time','created_time','created_at','created_at_utc','published_at','publish_timestamp','timestamp'];
export function publicationTextTime(value,observedAt=Date.now()){
 if(typeof value!=='string')return null;
 const text=value.trim().replace(/^(?:(?:streamed live|premiered|published|uploaded)(?: on)?|đã phát trực tiếp|đã công chiếu)\s*/iu,'').trim();
 const exact=exactPublicationTime(text);if(exact)return{createdAt:exact,evidence:'native_publication_text.iso',datePrecision:'second'};
 const day=/^\d{4}-\d\d-\d\d$/.test(text)?text:null;
 const named=/^(?:[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})$/.test(text)?Date.parse(text+' UTC'):NaN;
 const vi=/^(\d{1,2})\s+tháng\s+(\d{1,2}),?\s+(\d{4})$/iu.exec(text);
 const label=day||(vi?`${vi[3]}-${vi[2].padStart(2,'0')}-${vi[1].padStart(2,'0')}`:null);
 const at=label?Date.parse(label+'T00:00:00Z'):named;
 if(Number.isFinite(at)&&(!label||new Date(at).toISOString().slice(0,10)===label))return{createdAt:new Date(at).toISOString(),evidence:'native_publication_text.date',datePrecision:'day'};
 const relative=estimateYoutubeCommentDate(text,observedAt);
 return relative?{...relative,evidence:'native_publication_text.relative'}:null;
}
export function exactPublicationTime(value){
 if(typeof value==='number'||typeof value==='string'&&/^\d{10,13}$/.test(value)){const n=Number(value),ms=n<1e12?n*1000:n;return Number.isFinite(ms)&&ms>=946684800000&&ms<=Date.now()+86400000?new Date(ms).toISOString():null;}
 return typeof value==='string'&&/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
}
export function metaPublicationTime(node){
 // Only inspect the bound media itself and its native gated projection.
 for(const scope of [node?.if_not_gated_logged_out,node?.media,node])for(const key of fields){const at=exactPublicationTime(scope?.[key]);if(at)return {createdAt:at,evidence:'native_media.'+key};}
 return null;
}
export function youtubePublicationTime(player){
 const values=Object.entries({publishDate:player?.microformat?.playerMicroformatRenderer?.publishDate,uploadDate:player?.microformat?.playerMicroformatRenderer?.uploadDate,startTimestamp:player?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.startTimestamp});
 for(const [key,value]of values){const at=exactPublicationTime(value);if(at)return {createdAt:at,evidence:'native_player.'+key,datePrecision:'second'};}
 for(const [key,value]of values){const at=publicationTextTime(value);if(at)return {...at,evidence:'native_player.'+key};}
 return null;
}

// Consume the publication label already attached to this exact source item.
// Relative labels remain explicitly estimated and anchored to the source response.
export function applySourcePublicationText(item,observedAt){
 if(Number.isFinite(Date.parse(item.createdAt)))return item;
 const date=publicationTextTime(item.publishedText,observedAt);
 if(date)Object.assign(item,date,{dateEvidence:date.evidence});
 return item;
}
export function youtubeSourcePublication(node,observedAt){
 for(const key of ['publishDate','uploadDate','published_at','timestamp']){
  const exact=exactPublicationTime(node?.[key]);if(exact)return {createdAt:exact,dateEvidence:'native_source.'+key,datePrecision:'second'};
 }
 for(const key of ['publishDate','uploadDate']){const date=publicationTextTime(node?.[key],observedAt);if(date)return {...date,dateEvidence:'native_source.'+key};}
 return {};
}
