import {serializeCrawlItem} from './crawlerV8Es5.js';
function nativeUrlKey(value,platform){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  if(platform==='instagram'&&/^(?:www\.)?instagram\.com$/.test(u.hostname))return u.pathname.match(/^\/(?:p|reel|tv)\/([\w-]+)\/?$/)?.[1]||null;
  if(platform==='youtube'&&/^(?:www\.|m\.)?youtube\.com$/.test(u.hostname))return u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})\/?$/)?.[1]||null;
 }catch{}return null;
}
// Historical canonical imports can preserve exact native dates absent from an
// old queue payload. Require a complete search and a single agreed timestamp.
export function verifiedExistingPublication(item,source,hits,{complete=false}={}){
 if(!complete||!['instagram','youtube'].includes(source?.platform))return null;
 const matches=[];
 for(const hit of hits){
  const at=hit._source?.publishedDate;if(typeof at!=='string')continue;
  let expected;try{expected=serializeCrawlItem({...item,createdAt:at},source);}catch{continue;}
  if(['_index','_type','_id'].some(k=>hit[k]!==expected[k]))continue;
  if(['siteId','authorId','author','content'].some(k=>hit._source[k]!==expected._source[k]))continue;
  const urlKey=nativeUrlKey(item.url,source.platform);if(!urlKey||nativeUrlKey(hit._source.url,source.platform)!==urlKey)continue;
  matches.push({createdAt:expected._source.publishedDate,doc:hit._source});
 }
 if(!matches.length||new Set(matches.map(x=>x.createdAt)).size!==1)return null;
 const metrics={};for(const [field,key]of Object.entries({comments:'comment',likes:'likes',shares:'shares',views:'views'})){const values=matches.map(x=>x.doc[field]).filter(x=>Number.isSafeInteger(x)&&x>=0);if(values.length&&new Set(values).size===1)metrics[key]=values[0];}
 return {createdAt:matches[0].createdAt,evidence:'existing_es5.exact_native_post',metrics};
}
