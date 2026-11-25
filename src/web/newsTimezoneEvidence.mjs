import {parsePublishedDate} from './configurableNewsParser.mjs';
import {userConfirmedPublicationTimezone} from './newsUserConfirmedTimezone.mjs';

// Reparse without any configured timezone: epoch, RFC dates and clocks with a
// stated offset are independently anchored. A bare local clock stays unverified.
export function hasNativePublicationTimezone(parsed,config={}){
 const evidence=parsed?.extracted?.dateEvidence;
 if(!evidence||!parsed?._source?.publishedDate)return false;
 const approvedLocal=config.publicationTimePolicy==='native_date_midnight_if_missing'&&config.timezone==='Asia/Ho_Chi_Minh'||['minute','second'].includes(parsed.extracted.datePrecision)&&userConfirmedPublicationTimezone(config,parsed._source.url);
 const native=parsePublishedDate(evidence,approvedLocal?config.timezone:null,config.dateOrder,config.clockFormat);
 return !!native&&native.iso===parsed._source.publishedDate;
}
