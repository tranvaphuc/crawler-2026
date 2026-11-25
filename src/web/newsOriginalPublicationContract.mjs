import {userConfirmedTimezoneProof} from './newsUserConfirmedTimezone.mjs';
import {userConfirmedMidnightProof} from './newsUserConfirmedMidnight.mjs';
import {userConfirmedOriginalDayProof} from './newsUserConfirmedDayPrecision.mjs';
const originalSources=new Set(['url_bound_publication_feed','url_bound_original_jsonld','corroborated_original_metadata','scoped_original_article_clock']);
const historyUrl=raw=>{try{const u=new URL(raw);u.protocol='https:';u.hostname=u.hostname.replace(/^www\./,'');u.hash='';if(u.pathname!=='/')u.pathname=u.pathname.replace(/\/$/,'');for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k);u.searchParams.sort();return u.href;}catch{return null;}};
export function publicationHistoryUnconfirmed(url,config){const key=historyUrl(url);return !!key&&(config?.originalPublicationUncertainUrls||[]).some(raw=>historyUrl(raw)===key);}
// Production v1 means an original timestamp with an actual clock. Optional
// legacy parsing of date-only or updated fields never authorizes a news write.
export function originalPublicationContract(proof){
 if(userConfirmedMidnightProof(proof))return originalSources.has(proof.source);
 if(userConfirmedOriginalDayProof(proof))return originalSources.has(proof.source)||proof.source==='scoped_original_article_day';
 return !!(proof?.ok&&proof.version===1&&proof.policy==='strict_native_publication_v1'&&originalSources.has(proof.source)&&['minute','second'].includes(proof.precision)&&proof.defaultedClock!==true&&(!proof.publicationDateKind||proof.publicationDateKind==='original')&&proof.publicationDatePolicy!=='native_updated_when_original_missing'&&proof.publicationTimePolicy!=='native_date_midnight_if_missing'&&userConfirmedTimezoneProof(proof));
}
