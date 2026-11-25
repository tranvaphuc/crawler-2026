import {normalizeFacebookPostInput} from './facebookShare.js';
import {facebookAuthorProfileKey} from './facebookAuthorIdentity.js';
const fail=code=>{throw Object.assign(Error(code),{code});};
const normalized=x=>String(x||'').normalize('NFC').replace(/\r\n/g,'\n').trim();
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export function verifyFacebookAuthorRepairTarget(actual,expected){
 for(const key of ['siteId','parentId'])if(actual[key]!==expected[key])fail('ES5_AUTHOR_REPAIR_IDENTITY_CONFLICT');
 for(const key of ['parentDate','publishedDate'])if(!Number.isFinite(Date.parse(actual[key]))||Date.parse(actual[key])!==Date.parse(expected[key]))fail('ES5_AUTHOR_REPAIR_IDENTITY_CONFLICT');
 for(const key of ['author','content'])if(normalized(actual[key])!==normalized(expected[key]))fail('ES5_AUTHOR_REPAIR_CONTENT_CONFLICT');
 try{const a=new URL(actual.url),b=new URL(expected.url);if(a.protocol!=='https:'||normalizeFacebookPostInput(actual.url).postId!==normalizeFacebookPostInput(expected.url).postId||(a.searchParams.get('reply_comment_id')||a.searchParams.get('comment_id'))!==(b.searchParams.get('reply_comment_id')||b.searchParams.get('comment_id')))fail('ES5_AUTHOR_REPAIR_URL_CONFLICT');}catch{fail('ES5_AUTHOR_REPAIR_URL_CONFLICT');}
}
export async function repairPublicFacebookCommentAuthor(es,document,{evidence,profileUrl}){
 if(!String(evidence||'').startsWith('public_profile.')||!facebookAuthorProfileKey(profileUrl)||!/^fb(?:Page|Group|User)Comment$/.test(document._type)||!/^[1-9]\d*$/.test(document._source.authorId||''))fail('ES5_AUTHOR_REPAIR_PROOF_REQUIRED');
 const found=await es.search({index:'master2026*',type:document._type,ignoreUnavailable:true,size:8,body:{version:true,timeout:'20s',query:{ids:{values:[document._id]}}}});
 if(found.timed_out||found._shards?.failed||found.hits.total!==1||found.hits.hits.length!==1)fail('ES5_AUTHOR_REPAIR_NOT_UNIQUE');
 const hit=found.hits.hits[0];if(hit._index!==document._index||hit._type!==document._type||hit._id!==document._id)fail('ES5_AUTHOR_REPAIR_INDEX_CONFLICT');verifyFacebookAuthorRepairTarget(hit._source,document._source);
 if(hit._source.authorId===document._source.authorId)return{esWritten:false};
 if(/^\d+$/.test(hit._source.authorId||''))fail('ES5_NUMERIC_AUTHOR_CONFLICT');
 if(hit._source.authorId!=null&&!/^pfbid[A-Za-z0-9]+$/.test(hit._source.authorId))fail('ES5_AUTHOR_REPAIR_OPAQUE_TYPE_UNVERIFIED');
 if(!Number.isSafeInteger(hit._version))fail('ES5_AUTHOR_REPAIR_VERSION_REQUIRED');
 const before={...hit._source};delete before.authorId;
 await es.update({index:hit._index,type:hit._type,id:hit._id,version:hit._version,body:{doc:{authorId:document._source.authorId}}});
 const after=await es.get({index:hit._index,type:hit._type,id:hit._id}),rest={...after._source};delete rest.authorId;
 if(!after.found||after._source.authorId!==document._source.authorId||stable(before)!==stable(rest))fail('ES5_AUTHOR_REPAIR_POST_WRITE_VERIFICATION_FAILED');
 return{esWritten:true,beforeAuthorId:hit._source.authorId,afterAuthorId:document._source.authorId,esVersion:after._version};
}
