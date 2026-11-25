// Explicit instruction in this chat on 2026-11-17: keep the original date,
// using 00:00 for PVN and VNEEP when the publisher does not supply a clock.
const hosts=new Map([['pvn.vn',new Set(['pvn.vn','petrovietnam.vn'])],['tietkiemnangluong.com.vn',new Set(['tietkiemnangluong.com.vn'])]]);
const confirmation='original_date_with_midnight_vietnam_2026-11-17';
export function userConfirmedMidnight(config,url){
 const p=config?.midnightProvenance;
 if(config?.publicationTimePolicy!=='native_date_midnight_if_missing'||config.timezone!=='Asia/Ho_Chi_Minh'||p?.authority!=='explicit_user_confirmation'||p.confirmation!==confirmation||p.scope!==config.siteName||!hosts.has(p.scope))return false;
 if(!url)return true;
 try{const u=new URL(url);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password&&hosts.get(p.scope).has(u.hostname.replace(/^www\./,''));}catch{return false;}
}
export function userConfirmedMidnightProof(proof){
 if(!proof?.ok||proof.version!==1||proof.policy!=='strict_native_publication_v1'||proof.precision!=='day'||proof.defaultedClock!==true||proof.publicationDateKind!=='original'||proof.publicationDatePolicy==='native_updated_when_original_missing')return false;
 if(!userConfirmedMidnight({siteName:proof.midnightAuthority?.scope,publicationTimePolicy:proof.publicationTimePolicy,timezone:proof.timezone,midnightProvenance:proof.midnightAuthority},proof.url))return false;
 const time=Date.parse(proof.publishedDate);if(!Number.isFinite(time)||!/^\d{4}-\d{2}-\d{2}$/.test(proof.originalCalendarDay||''))return false;
 return new Date(time+7*3600000).toISOString()===proof.originalCalendarDay+'T00:00:00.000Z';
}
