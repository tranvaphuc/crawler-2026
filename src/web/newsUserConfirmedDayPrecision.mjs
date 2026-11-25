export const USER_CONFIRMED_DAY_PRECISION='user_confirmed_original_day_precision';
export const ORIGINAL_DAY_PROOF_POLICY='strict_original_publication_day_v2';
const confirmation='original_date_only_without_defaulted_clock_2026-11-17';
const host=url=>{try{const u=new URL(url);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.hostname.replace(/^www\./,''):null;}catch{return null;}};
export function userConfirmedDayPrecision(config,url){
 const p=config?.datePrecisionProvenance;
 return config?.publicationPrecisionPolicy===USER_CONFIRMED_DAY_PRECISION&&p?.authority==='explicit_user_confirmation'&&p.confirmation===confirmation&&typeof p.scope==='string'&&p.scope.length>0&&p.scope===config.siteName&&(!url||host(url)===p.scope);
}
export function originalDayValue(raw,config,parseDate){
 // Strip a stated zone only for parsing the calendar. No clock is serialized.
 const text=String(raw??'').replace(/\b(?:GMT|UTC)(?:\s*[+-]\s*\d{1,2}(?::?\d{2})?)?\b|\b(?:EST|EDT|PST|PDT|CET|CEST|JST|KST|AEST|AEDT|AWST)\b/gi,'');
 if(/\d{1,2}:\d{2}/.test(text))return null;
 const d=parseDate(text,'UTC',config.dateOrder,config.clockFormat);
 return d?.precision==='day'?d.iso.slice(0,10):null;
}
export function validOriginalDay(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
 const n=Date.parse(value);return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value;
}
export function userConfirmedOriginalDayProof(proof){
 return !!(proof?.ok&&typeof proof.url==='string'&&!!host(proof.url)&&proof.version===2&&proof.policy===ORIGINAL_DAY_PROOF_POLICY&&proof.precision==='day'&&validOriginalDay(proof.publishedDate)&&proof.defaultedClock!==true&&proof.publicationDateKind==='original'&&proof.publicationDatePolicy!=='native_updated_when_original_missing'&&proof.publicationTimePolicy!=='native_date_midnight_if_missing'&&userConfirmedDayPrecision({siteName:proof.datePrecisionAuthority?.scope,publicationPrecisionPolicy:proof.publicationPrecisionPolicy,datePrecisionProvenance:proof.datePrecisionAuthority},proof.url));
}
export function publicationOutsideWindow(value,maxAgeHours,now=Date.now()){
 if(!Number.isFinite(maxAgeHours))return false;
 // A day without a stated zone describes an interval, not an instant. Only
 // exclude it when even the latest possible instant (UTC-12) is too old.
 const uncertainty=validOriginalDay(value)?36*3600000:0;
 return now-Date.parse(value)-uncertainty>maxAgeHours*3600000;
}
