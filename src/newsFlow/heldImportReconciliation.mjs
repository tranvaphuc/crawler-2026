// Manual confirmation of an interrupted import never edits an ES document.
// Duplicate historical identities are retained, with the exact intended target
// preferred only after its native identity and original clock are verified.
export function selectConfirmedHeldImport(item,hits,{same,publicationVerified,allowLegacyMinute=false}){
 if(!publicationVerified||!Array.isArray(hits))return null;
 const expected=Date.parse(item.doc?._source?.publishedDate);
 if(!Number.isFinite(expected))return null;
 const valid=hits.filter(hit=>{
  if(!hit?.found||hit.error||hit._type!==item.doc._type||!same(hit,item)||hit._source?.siteName!==item.doc._source.siteName)return false;
  const actual=Date.parse(hit._source.publishedDate);
  return actual===expected||(allowLegacyMinute&&Number.isFinite(actual)&&actual%60000===0&&Math.floor(actual/60000)===Math.floor(expected/60000));
 });
 const exact=valid.filter(hit=>hit._id===item.doc._id&&hit._index===item.doc._index);
 if(exact.length===1)return exact[0];
 return valid.length===1?valid[0]:null;
}
