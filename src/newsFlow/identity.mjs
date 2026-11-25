import {cnnLitePublicAccessProofMatches} from '../web/newsCnnLite.mjs';
import {nativeVideoDescriptionProofMatches} from '../web/newsNativeVideoDescription.mjs';
import {userConfirmedOriginalDayProof,validOriginalDay} from '../web/newsUserConfirmedDayPrecision.mjs';
import {originalPublicationContract,publicationHistoryUnconfirmed} from '../web/newsOriginalPublicationContract.mjs';
import {approvedPublicationProofSource} from '../web/newsPublicationProofSource.mjs';
import {hasStrictPublicationProof,STRICT_PUBLICATION_POLICY} from '../web/newsStrictPublication.mjs';
import crypto from 'node:crypto';
import {hasNativePublicationTimezone} from '../web/newsTimezoneEvidence.mjs';
import {legacyNewsId,weeklyIndex,md5Legacy} from '../web/newsParser.mjs';
const fail=code=>Object.assign(new Error(code),{code});
export function requestUrl(raw){const u=new URL(raw);if(!/^https?:$/.test(u.protocol)||u.username||u.password)throw fail('INVALID_PUBLIC_NEWS_URL');u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k);return u.href;}
export function requestKey(raw){const u=new URL(requestUrl(raw));u.searchParams.sort();return u.href;}
export function articleKey(raw){const u=new URL(requestKey(raw));u.hostname=u.hostname.replace(/^www\./,'');u.protocol='https:';if(u.pathname!=='/')u.pathname=u.pathname.replace(/\/$/,'');return u.href;}
export function urlAliases(raw){const u=new URL(requestKey(raw)),hosts=[u.hostname.replace(/^www\./,''),'www.'+u.hostname.replace(/^www\./,'')],paths=new Set([u.pathname,u.pathname==='/'?'/':u.pathname.replace(/\/$/,'')+'/',u.pathname.replace(/\/$/,'')||'/']);const out=new Set([raw,u.href]);for(const host of hosts)for(const protocol of ['http:','https:'])for(const p of paths){const n=new URL(u);n.host=host;n.protocol=protocol;n.pathname=p;out.add(n.href);}return [...out];}
export function nativeArticleId(raw,config={}){const u=new URL(raw);if(config.nativeIdQuery)return u.searchParams.get(config.nativeIdQuery);if(config.nativeIdQueryPattern)return [...u.searchParams].find(([key])=>new RegExp(config.nativeIdQueryPattern,'i').test(key))?.[1]||null;if(config.nativeIdPattern)return u.pathname.match(new RegExp(config.nativeIdPattern))?.[1]||null;const id=u.pathname.match(/(?:[-/]|post)(\d{6,})(?:\.html?|\.chn|\.epi|\.tpo|\.vnp|\/)?$/i)?.[1]||null;if(id&&/^(19|20)\d{2}(0[1-9]|1[012])(0[1-9]|[12]\d|3[01])$/.test(id))return null;return id;}
export function nativeKey(raw,config){const host=new URL(raw).hostname.replace(/^www\./,''),root=config.registrableDomain||config.siteName;if(host!==root&&!host.endsWith('.'+root)&&!(config.allowedHosts||[]).includes(host))return null;const id=nativeArticleId(raw,config);if(!id)return null;const family=/video|\/tv\/|dt360|shorts/i.test(new URL(raw).pathname)?'video':'article';return root+'|'+family+'|'+id;}
export function toEs5News(parsed,config,{now=new Date().toISOString()}={}){
 if(config.originalPublicationBlockedReason)throw fail('NEWS_ORIGINAL_PUBLICATION_QUARANTINED');
 if(publicationHistoryUnconfirmed(parsed?._source?.url,config))throw fail('NEWS_ORIGINAL_PUBLICATION_HISTORY_UNCONFIRMED');
 const p=parsed?._source,e=parsed?.extracted;if(!p||!e||parsed.error)throw fail('NEWS_PARSE_NOT_VERIFIED');
 const missingVideoSapo=nativeVideoDescriptionProofMatches(p,e.descriptionOmissionProof,config);
 for(const k of ['title','content','description','url','publishedDate','siteId','siteName'])if(typeof p[k]!=='string'||!p[k].trim()&&!(k==='description'&&missingVideoSapo))throw fail('NEWS_MISSING_'+k.toUpperCase());
 if(p.content==='Images/Video'&&!missingVideoSapo)throw fail('NEWS_MEDIA_WITHOUT_NATIVE_TEXT');
 if(config.publicationValidationPolicy===STRICT_PUBLICATION_POLICY&&!hasStrictPublicationProof(parsed))throw fail('NEWS_PUBLICATION_PROOF_REQUIRED');
 if(config.publicationValidationPolicy===STRICT_PUBLICATION_POLICY&&!approvedPublicationProofSource(e.publicationProof))throw fail('NEWS_PUBLICATION_SOURCE_UNAPPROVED');
 if(config.publicationValidationPolicy===STRICT_PUBLICATION_POLICY&&!originalPublicationContract(e.publicationProof))throw fail('NEWS_ORIGINAL_PUBLICATION_CLOCK_REQUIRED');
 const approvedOriginalDay=e.datePrecision==='day'&&userConfirmedOriginalDayProof(e.publicationProof)&&p.publishedDatePrecision==='day';
 const approvedDay=approvedOriginalDay||e.datePrecision==='day'&&config.publicationTimePolicy==='native_date_midnight_if_missing'&&hasNativePublicationTimezone(parsed,config);
 if(!['second','minute'].includes(e.datePrecision)&&!approvedDay)throw fail('NEWS_PUBLICATION_PRECISION_UNCONFIRMED');
 if(e.cnnLitePublicAccessProof&&!cnnLitePublicAccessProofMatches(p,e.cnnLitePublicAccessProof))throw fail('NEWS_PUBLIC_ACCESS_PROOF_INVALID');
 if(config.nativePublicationAdapter==='cnn_public_lite'&&!cnnLitePublicAccessProofMatches(p,e.cnnLitePublicAccessProof))throw fail('NEWS_PUBLIC_ACCESS_PROOF_REQUIRED');
 if(!e.dateEvidence||!e.dateTimezone||e.publisherRestricted)throw fail('NEWS_PUBLICATION_OR_ACCESS_UNCONFIRMED');
 const time=Date.parse(p.publishedDate),clock=Date.parse(now);if(!Number.isFinite(time)||!Number.isFinite(clock)||time<Date.UTC(1990,0,1)||(approvedOriginalDay?p.publishedDate>new Date(clock+14*3600000).toISOString().slice(0,10):time>clock+300000))throw fail('NEWS_INVALID_PUBLICATION_TIME');
 const author=e.authorWasFallback?p.siteName:p.author||p.siteName;
 const doc={_index:weeklyIndex(p.publishedDate,'Asia/Ho_Chi_Minh'),_type:'newsTopic',_id:legacyNewsId({registrableDomain:config.registrableDomain,title:p.title,identityUrl:p.url}),_source:{
  insertedDate:new Date(clock).toISOString(),publishedDate:approvedOriginalDay?p.publishedDate:new Date(time).toISOString(),...(approvedOriginalDay?{publishedDatePrecision:'day'}:{}),authorId:e.authorWasFallback?p.siteId:md5Legacy(p.siteId+author),author,
  siteId:p.siteId,siteName:p.siteName,title:p.title,content:p.content,description:p.description,...(missingVideoSapo?{descriptionStatus:p.descriptionStatus,...(p.nativeMediaUrls?{nativeMediaUrls:p.nativeMediaUrls}:{nativeVideoUrl:p.nativeVideoUrl})}:{}),url:p.url,picture:p.picture||'',likes:0,comments:0,shares:0,interactions:0,ds:{source:'news-flow-http'}
 }};
 return doc;
}
export function validateNewsMapping(doc,properties){
 const expected={insertedDate:'date',publishedDate:'date',authorId:'keyword',author:'keyword',siteId:'keyword',siteName:'keyword',title:'text',content:'text',description:'text',url:'keyword',picture:'keyword',likes:'integer',comments:'integer',shares:'integer',interactions:'integer',ds:'object'};
 const onlyDay=validOriginalDay(doc._source.publishedDate);if(onlyDay&&doc._source.publishedDatePrecision!=='day'||doc._source.publishedDatePrecision!==undefined&&(!onlyDay||doc._source.publishedDatePrecision!=='day'))throw fail('ES5_PUBLICATION_PRECISION_MISMATCH');
 if(doc._source.publishedDatePrecision!==undefined)expected.publishedDatePrecision='keyword';
 if(doc._source.nativeMediaUrls!==undefined){if(doc._source.description!==''||doc._source.descriptionStatus!=='not_published_by_source'||!Array.isArray(doc._source.nativeMediaUrls)||!doc._source.nativeMediaUrls.length||doc._source.nativeMediaUrls.some(u=>typeof u!=='string'||!/^https?:\/\//.test(u)))throw fail('ES5_NATIVE_MEDIA_DESCRIPTION_STATUS_INVALID');expected.descriptionStatus='keyword';expected.nativeMediaUrls='keyword_array';}
 else if(doc._source.descriptionStatus!==undefined||doc._source.nativeVideoUrl!==undefined){if(doc._source.description!==''||doc._source.descriptionStatus!=='not_published_by_source'||typeof doc._source.nativeVideoUrl!=='string')throw fail('ES5_NATIVE_VIDEO_DESCRIPTION_STATUS_INVALID');expected.descriptionStatus='keyword';expected.nativeVideoUrl='keyword';}
 for(const key of Object.keys(expected))if(!(key in doc._source))throw fail('ES5_MISSING_NEWS_FIELD_'+key);
 for(const [key,value]of Object.entries(doc._source)){
  const type=properties?.[key];if(!type)throw fail('ES5_UNMAPPED_NEWS_FIELD_'+key);
  if(!expected[key]||(type.properties?'object':type.type)!==(expected[key]==='keyword_array'?'keyword':expected[key]))throw fail('ES5_NEWS_FIELD_MAPPING_CHANGED_'+key);
  if(type.type==='date'&&(typeof value!=='string'||!Number.isFinite(Date.parse(value))))throw fail('ES5_INVALID_NEWS_DATE_'+key);
  if(expected[key]==='keyword_array'&&(!Array.isArray(value)||value.some(v=>typeof v!=='string')))throw fail('ES5_INVALID_NEWS_ARRAY_'+key);
  if(expected[key]!=='keyword_array'&&['keyword','text'].includes(type.type)&&typeof value!=='string')throw fail('ES5_INVALID_NEWS_STRING_'+key);
  if(type.type==='integer'&&(!Number.isSafeInteger(value)||value<0||value>2147483647))throw fail('ES5_INVALID_NEWS_COUNTER_'+key);
  if(type.properties)for(const [k,v]of Object.entries(value))if(!type.properties[k]||typeof v!=='string')throw fail('ES5_INVALID_NEWS_OBJECT_'+key);
 }
 if(doc._type!=='newsTopic'||doc._index!==weeklyIndex(doc._source.publishedDate)||!/^[a-f0-9]{32}$/.test(doc._id))throw fail('ES5_NEWS_IDENTITY_INVALID');return true;
}
export const sha=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
