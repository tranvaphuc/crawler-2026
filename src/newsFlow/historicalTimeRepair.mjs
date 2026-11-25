import {isDeepStrictEqual} from 'node:util';
// Legacy records may contain already-mapped fields outside today's news payload.
// Preserve them only when the destination has exactly the same field mapping.
export function validateHistoricalTimeMapping(source,sourceProperties,targetProperties){
 for(const field of Object.keys(source))if(!sourceProperties?.[field]||!targetProperties?.[field]||!isDeepStrictEqual(sourceProperties[field],targetProperties[field]))throw Object.assign(Error('HISTORICAL_MAPPING_NOT_IDENTICAL_'+field),{code:'HISTORICAL_MAPPING_NOT_IDENTICAL_'+field});
 if(sourceProperties.publishedDate.type!=='date'||!Number.isFinite(Date.parse(source.publishedDate)))throw Error('HISTORICAL_PUBLICATION_DATE_INVALID');
 return true;
}
