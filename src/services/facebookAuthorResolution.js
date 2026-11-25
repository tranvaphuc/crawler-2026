import {facebookAuthorProfileKey,facebookPublicAuthorProfileUrl,facebookAuthorRoute,cachedFacebookCommentAuthor,collectFacebookCommentAuthorIdentities,facebookCommentAuthorIdentity} from './facebookAuthorIdentity.js';
import {serializeCrawlItem} from './crawlerV8Es5.js';
const numeric=x=>typeof x==='string'&&/^[1-9]\d*$/.test(x);
const unsupportedEvidence=e=>/^user_confirmed(?:\.|$)/.test(e||'');
export function responseCommentActors(roots,items,parent){
 const wanted=new Map(items.map(item=>[item.id,item])),found=new Map();
 for(const root of roots){const identities=collectFacebookCommentAuthorIdentities([],root);const visit=v=>{if(!v||typeof v!=='object')return;
  const item=wanted.get(v.legacy_fbid);if(item&&v.author&&Number.isSafeInteger(v.created_time)&&new Date(v.created_time*1000).toISOString()===item.createdAt&&v.author.name===item.author?.name){const identity=facebookCommentAuthorIdentity(v,identities),actor={...importCommentActor(item,parent),authorId:identity.id,authorUrl:identity.profileUrl||item.author?.profileUrl,authorOpaqueId:identity.opaqueId||item.author?.opaqueId,authorIdEvidence:identity.evidence};const prior=found.get(item.id);if(prior?.authorIdEvidence==='response.author_identity_conflict'){}else if(!prior||!prior.authorId)found.set(item.id,actor);else if(actor.authorId&&actor.authorId!==prior.authorId)found.set(item.id,{...actor,authorId:null,authorIdEvidence:'response.author_identity_conflict'});}
  for(const x of Object.values(v))if(x&&typeof x==='object')visit(x);
 };visit(root);}
 return found;
}
export function matchesFacebookCommentUrl(value,parent,item){
 try{const u=new URL(value);if(u.protocol!=='https:'||! /^(?:www\.|m\.|web\.)?facebook\.com$/.test(u.hostname)||u.username||u.password||u.port)return false;
  const [owner,post]=String(parent.systemId).split('_'),path=u.pathname.replace(/\/$/,'');
  if(!['/'+parent.systemId,'/'+owner+'/posts/'+post,'/groups/'+owner+'/posts/'+post].includes(path))return false;
  const clean=v=>v?.startsWith(post+'_')?v.slice(post.length+1):v;
  const root=clean(u.searchParams.get('comment_id')),reply=clean(u.searchParams.get('reply_comment_id'));
  return reply?item.type==='reply'&&reply===item.id&&root===item.parentId:root===item.id;
 }catch{return false;}
}
// Reuse a prior canonical import only when the whole comment identity agrees.
// A matching display name alone is never proof of an author ID.
export function verifiedExistingFacebookAuthor(item,source,parent,hit){
 if(source?.platform!=='facebook'||!parent||!hit?.found||!numeric(hit._source?.authorId))return null;
 let expected;try{expected=serializeCrawlItem({...item,author:{...item.author,id:hit._source.authorId}},source,{parent});}catch{return null;}
 if(['_index','_type','_id'].some(k=>hit[k]!==expected[k]))return null;
 for(const key of ['siteId','publishedDate','author','content','parentId','parentDate'])if((hit._source[key]??null)!==(expected._source[key]??null))return null;
 if(hit._source.commentParentId!=null&&hit._source.commentParentId!==expected._source.commentParentId)return null;
 if(!matchesFacebookCommentUrl(hit._source.url,parent,item))return null;
 return {id:hit._source.authorId,evidence:'existing_es5.exact_canonical_comment'};
}
export function authorLookupKeys(comment){
 return [...new Set([comment.authorOpaqueId,facebookAuthorProfileKey(comment.authorUrl),facebookAuthorProfileKey(facebookPublicAuthorProfileUrl({profileUrl:comment.authorUrl,opaqueId:comment.authorOpaqueId}))].filter(Boolean))];
}
export function createMongoAuthorStore(collection){
 return {
  async getMany(keys){return collection.find({_id:{$in:keys},conflict:{$ne:true},evidence:{$not:/^user_confirmed(?:\.|$)/},checkedAt:{$gte:new Date(Date.now()-86400000)}}).toArray();},
  async putMany(facts){
   const unique=new Map();for(const f of facts)if(numeric(f.id))for(const key of f.keys||[])unique.set(key,{...f,_id:key});if(!unique.size)return;
   const existing=new Map((await collection.find({_id:{$in:[...unique.keys()]}}).toArray()).map(x=>[x._id,x]));
   const ops=[...unique.values()].map(f=>({updateOne:{filter:{_id:f._id},update:existing.has(f._id)&&existing.get(f._id).id!==f.id?{$set:{conflict:true,conflictingId:f.id,checkedAt:new Date()}}:{$set:{id:f.id,evidence:f.evidence,checkedAt:new Date()},$setOnInsert:{createdAt:new Date()}},upsert:true}}));
   await collection.bulkWrite(ops,{ordered:false});
  }
 };
}
export function createFacebookAuthorResolver({store,maxCache=50000}={}){
 const cache=new Map();
 const remember=async comments=>{const facts=[];for(const c of comments)if(numeric(c.authorId)&&!unsupportedEvidence(c.authorIdEvidence)&&!/(?:conflict|anonymous_post)/.test(c.authorIdEvidence||'')){const keys=authorLookupKeys(c);for(const key of keys){const old=cache.get(key);cache.set(key,old&&old.id!==c.authorId?{id:null,evidence:'cached_author_identity_conflict'}:{id:c.authorId,evidence:c.authorIdEvidence||'response.numeric_actor'});}if(keys.length)facts.push({id:c.authorId,evidence:c.authorIdEvidence||'response.numeric_actor',keys});}if(facts.length)await store?.putMany(facts);while(cache.size>maxCache)cache.delete(cache.keys().next().value);};
 return async function resolve(comments,request,deadline=Date.now()+60000){
  await remember(comments);
  const keys=[...new Set(comments.filter(c=>!c.authorId).flatMap(authorLookupKeys))];
  if(store&&keys.length)for(const fact of await store.getMany(keys))if(numeric(fact.id)&&!unsupportedEvidence(fact.evidence))cache.set(fact._id,{id:fact.id,evidence:fact.evidence});
  const apply=()=>{for(const c of comments)if(!c.authorId){const hit=cachedFacebookCommentAuthor(c,cache);if(numeric(hit?.id)){c.authorId=hit.id;c.authorIdEvidence=hit.evidence;}}};apply();
  if(request?.resolveAuthorRoutes){
   for(const variant of [0,1,2]){
    const unresolved=comments.filter(c=>!c.authorId&&c.authorIdEvidence!=='response.author_identity_conflict');
    const urls=new Map();for(const c of unresolved){const url=variant===0?facebookPublicAuthorProfileUrl({profileUrl:c.authorUrl,opaqueId:c.authorOpaqueId}):/^pfbid[A-Za-z0-9]+$/.test(c.authorOpaqueId||'')?'https://www.facebook.com/'+(variant===1?'profile.php?id=':'')+c.authorOpaqueId:null;const route=url&&facebookAuthorRoute(url);if(route&&!urls.has(route))urls.set(route,url);}
    const values=[...urls.values()];for(let i=0;i<values.length;i+=10){if(Date.now()>deadline-1500)break;const batch=values.slice(i,i+10);let resolved;try{resolved=await request.resolveAuthorRoutes(batch);}catch(e){if(e.code==='AUTHOR_IDENTITY_UNAVAILABLE')continue;throw e;}
     for(const c of unresolved){const route=[...urls].find(([,url])=>batch.includes(url)&&((variant===0?facebookPublicAuthorProfileUrl({profileUrl:c.authorUrl,opaqueId:c.authorOpaqueId}):'https://www.facebook.com/'+(variant===1?'profile.php?id=':'')+c.authorOpaqueId)===url))?.[0];const proof=route&&resolved.get(route);if(numeric(proof?.id)){c.authorId=proof.id;c.authorIdEvidence='public_profile.'+proof.evidence;}}
     await remember(unresolved.filter(c=>c.authorId));apply();
    }
   }
  }
  return comments;
 };
}
export function importCommentActor(item,parent){return {_id:item.id,idPost:parent.nativeId,time:item.createdAt,authorId:item.author?.id,authorUrl:item.author?.profileUrl,authorOpaqueId:item.author?.opaqueId,authorIdEvidence:item.author?.idEvidence};}
