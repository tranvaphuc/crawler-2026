import {nativeVideoDescriptionWriteAllowed} from '../web/newsNativeVideoDescription.mjs';
import {originalPublicationContract,publicationHistoryUnconfirmed} from '../web/newsOriginalPublicationContract.mjs';
import {approvedPublicationProofSource} from '../web/newsPublicationProofSource.mjs';
import {hasStrictPublicationProof} from '../web/newsStrictPublication.mjs';
import {articleKey,nativeKey,nativeArticleId,urlAliases,validateNewsMapping,sha} from './identity.mjs';
const fail=code=>Object.assign(new Error(code),{code});
const ref=h=>({_index:h._index,_type:h._type,_id:h._id});
const apiRef=h=>({index:h._index,type:h._type,id:h._id});
export class NewsEs5Sink{
 constructor({es,state,proof,write=false,onResult=()=>{},beforeWrite=()=>{},targetFirst=false,noRetry=false,requirePublicationProof=false,onBatch=()=>{}}){Object.assign(this,{es,state,proof,write,onResult,beforeWrite,targetFirst,noRetry,requirePublicationProof,onBatch});this.mappings=new Map();this.ready=false;}
 publicationVerified(doc,config){return nativeVideoDescriptionWriteAllowed(doc,config)&&!publicationHistoryUnconfirmed(doc?._source?.url,config)&&(!this.requirePublicationProof||originalPublicationContract(config.publicationProof)&&approvedPublicationProofSource(config.publicationProof)&&hasStrictPublicationProof({_source:doc._source,extracted:{publicationProof:config.publicationProof}}));}
 async initialize(){const info=await this.es.info();if(!String(info.version.number).startsWith('5.6.')||!this.proof?.summary?.verified||!this.proof.summary.clusterFingerprint)throw fail('NEWS_ES5_COMPATIBILITY_NOT_VERIFIED');if(this.proof.summary.clusterFingerprint!==sha(info.cluster_uuid))throw fail('NEWS_ES5_CLUSTER_CHANGED');this.ready=true;}
 same(hit,item){const source=hit._source;if(!source?.url)return false;const aliases=item.identityUrls??=new Set(item.aliases.flatMap(urlAliases).map(articleKey));if(aliases.has(articleKey(source.url)))return true;const expected=item.nativeIdentity??=nativeKey(item.doc._source.url,item.config)||false,actual=nativeKey(source.url,item.config);return !!expected&&expected===actual;}
 async lookup(items,{targetFirst=this.targetFirst}={}){
  const answer=new Map(),unknown=[];const known=items.map(item=>({item,known:this.state.known(item.doc._source.url,item.config)}));
  const mapped=known.filter(x=>x.known);
  if(mapped.length){const r=await this.es.mget({body:{docs:mapped.map(x=>x.known)}});if(!Array.isArray(r.docs)||r.docs.length!==mapped.length)throw fail('ES5_IDENTITY_MGET_INCOMPLETE');r.docs.forEach((h,i)=>{if(h.error)throw fail('ES5_IDENTITY_MGET_FAILED');const {item}=mapped[i];if(!h.found||!this.same(h,item))answer.set(item.row.id,{blocked:'KNOWN_ES_IDENTITY_UNCONFIRMED'});else answer.set(item.row.id,{hits:[h]});});}
  for(const x of known)if(!x.known)unknown.push(x.item);
  // A verified existing target needs no ES mutation. Only unresolved identities
  // need the historical cross-index search; newly created documents still get it below.
  if(targetFirst&&unknown.length){
   const candidates=unknown.splice(0),r=await this.es.mget({body:{docs:candidates.map(i=>({...ref(i.doc),_source:['url','siteName']}))}});
   if(!Array.isArray(r.docs)||r.docs.length!==candidates.length)throw fail('ES5_TARGET_MGET_INCOMPLETE');
   r.docs.forEach((h,n)=>{const item=candidates[n];
    if(h.error&&h.error.type!=='index_not_found_exception')answer.set(item.row.id,{blocked:'ES5_TARGET_GET_UNCONFIRMED'});
    else if(!h.found)unknown.push(item);
    else if(h._id!==item.doc._id||h._index!==item.doc._index||h._type!=='newsTopic'||!this.same(h,item))answer.set(item.row.id,{blocked:'ES5_ID_CONFLICT'});
    else if(h._source.siteName!==item.doc._source.siteName)answer.set(item.row.id,{blocked:'ES5_PUBLISHER_IDENTITY_CONFLICT'});
    else answer.set(item.row.id,{hits:[h]});
   });
  }
  if(!unknown.length)return answer;
  const search=async should=>{const r=await this.es.search({index:'master*',type:'newsTopic',ignoreUnavailable:true,allowNoIndices:false,body:{size:3000,timeout:'10s',query:{bool:{should,minimum_should_match:1}},_source:['url','siteName']}});const total=typeof r.hits?.total==='number'?r.hits.total:r.hits?.total?.value;if(r.timed_out||r._shards?.failed||!Array.isArray(r.hits?.hits)||total>r.hits.hits.length)throw fail('ES5_IDENTITY_SEARCH_INCOMPLETE');return r;};
  // Exact keyword URL/ID lookup first. Never run a leading-wildcard scan over the entire historical term dictionary.
  const r=await search([{terms:{url:[...new Set(unknown.flatMap(x=>x.aliases.flatMap(urlAliases)))]}},{ids:{values:unknown.map(x=>x.doc._id)}}]);
  const nativeQueries=[];
  for(const item of unknown.filter(item=>!r.hits.hits.some(h=>this.same(h,item)))){const id=nativeArticleId(item.doc._source.url,item.config),u=new URL(item.doc._source.url);const names=[item.config.siteName,item.config.siteId,item.config.registrableDomain,...item.config.allowedHosts||[]].filter(Boolean),hosts=new Set([u.hostname,u.hostname.replace(/^www\./,''),'www.'+u.hostname.replace(/^www\./,''),...item.config.allowedHosts||[]]);const patterns=[...hosts].flatMap(host=>['http://','https://'].map(protocol=>id&&/^[\w-]{4,100}$/.test(id)?{wildcard:{url:protocol+host+'/*'+id+'*'}}:{prefix:{url:protocol+host+(u.pathname.replace(/\/$/,'')||'/')}}));nativeQueries.push({bool:{filter:[{bool:{should:[{terms:{siteName:names}},{terms:{siteId:names}}],minimum_should_match:1}},{bool:{should:patterns,minimum_should_match:1}}]}});}
  if(nativeQueries.length){const native=await search(nativeQueries);const keys=new Set(r.hits.hits.map(h=>h._index+'|'+h._id));for(const h of native.hits.hits)if(!keys.has(h._index+'|'+h._id)){keys.add(h._index+'|'+h._id);r.hits.hits.push(h);}}
  for(const item of unknown){const hits=r.hits.hits.filter(h=>this.same(h,item));const foreign=hits.some(h=>h._source.siteName!==item.doc._source.siteName);const collision=r.hits.hits.some(h=>h._id===item.doc._id&&!this.same(h,item));const potential=r.hits.hits.filter(h=>!this.same(h,item)&&nativeArticleId(h._source?.url||'https://invalid.test/',item.config)===nativeArticleId(item.doc._source.url,item.config)&&nativeKey(h._source?.url||'https://invalid.test/',item.config));answer.set(item.row.id,foreign?{blocked:'ES5_PUBLISHER_IDENTITY_CONFLICT'}:collision?{blocked:'ES5_ID_CONFLICT'}:potential.length?{blocked:'POTENTIAL_NATIVE_ID_NAMESPACE_CONFLICT'}:{hits});}
  return answer;
 }
 async mapping(doc){
  if(this.mappings.has(doc._index))return this.mappings.get(doc._index);
  // An existing ES5 index can have a valid _default_ mapping before its first
  // newsTopic create. A typed GET returns 404 in that case. Read the index mapping
  // without creating/updating any mapping, and validate every payload field first.
  const r=await this.es.indices.getMapping({index:doc._index}),types=r[doc._index]?.mappings;
  const props=types?.newsTopic?types.newsTopic.properties:types?._default_?.properties;
  if(!props)throw fail('ES5_NEWS_MAPPING_MISSING');this.mappings.set(doc._index,props);return props;
 }
 bind(item,doc){try{this.state.bind(doc,item.aliases,item.config);return true;}catch(e){if(e.message!=='NEWS_IDENTITY_LEDGER_CONFLICT')throw e;this.state.writeState(item.row.id,'held','NEWS_IDENTITY_LEDGER_CONFLICT');this.onResult({state:'held',reason:'NEWS_IDENTITY_LEDGER_CONFLICT',id:item.row.id,url:item.doc._source.url});return false;}}
 existing(item,hit){if(!this.bind(item,ref(hit)))return;this.state.writeState(item.row.id,'existing');this.onResult({state:'existing',id:hit._id,index:hit._index,url:item.doc._source.url});}
 failItem(item,reason){if(!this.noRetry)return this.state.retryWrite(item.row.id,reason);this.state.writeState(item.row.id,'held',reason);this.onResult({state:'held',reason,id:item.row.id,url:item.doc._source.url});}
 async flush(limit=30){const started=performance.now();this.batchProfile={items:0};try{return await this.flushBatch(limit);}finally{const p=this.batchProfile;this.batchProfile=null;if(p.items)this.onBatch({event:'es_import_batch',...p,totalMs:Math.round(performance.now()-started)});}}
 async flushBatch(limit=30){
  if(!this.ready)await this.initialize();
  const selected=performance.now(),items=(this.noRetry?this.state.claimWrites(limit):this.state.pendingWrites(limit)).map(row=>({row,doc:JSON.parse(row.doc),config:JSON.parse(row.config),aliases:JSON.parse(row.aliases)}));this.batchProfile.items=items.length;this.batchProfile.selectMs=Math.round(performance.now()-selected);if(!items.length)return 0;
  for(let i=items.length-1;i>=0;i--)if(!this.publicationVerified(items[i].doc,items[i].config)){this.state.writeState(items[i].row.id,'held','NEWS_PUBLICATION_PROOF_REQUIRED');items.splice(i,1);}
  if(!items.length)return this.batchProfile.items;
  const lookupAt=performance.now();let lookup;try{lookup=await this.lookup(items);}catch(e){for(const i of items)this.failItem(i,e.code||'ES5_IDENTITY_LOOKUP_FAILED');return this.noRetry?items.length:0;}finally{this.batchProfile.lookupMs=Math.round(performance.now()-lookupAt);}
  const create=[];
  for(const item of items){
   const found=lookup.get(item.row.id);if(found?.blocked){this.state.writeState(item.row.id,'held',found.blocked);continue;}
   if(found?.hits?.length>1){this.state.writeState(item.row.id,'held','EXISTING_DUPLICATE_IDENTITY_GROUP');continue;}
   if(found?.hits?.length===1){this.existing(item,found.hits[0]);continue;}
   // A redirect/source alias already bound locally must be reviewed before any
   // new create, even when lookup of the final publisher URL found no document.
   if(item.aliases.some(url=>this.state.known(url,item.config))){this.state.writeState(item.row.id,'held','ES5_ALIAS_IDENTITY_REQUIRES_REVIEW');continue;}
   try{validateNewsMapping(item.doc,await this.mapping(item.doc));}catch(e){this.failItem(item,e.code||'ES5_MAPPING_UNAVAILABLE');continue;}
   if(!this.write){this.state.writeState(item.row.id,'dry_run');this.onResult({state:'dry_run',id:item.doc._id,index:item.doc._index,url:item.doc._source.url});continue;}
   create.push(item);if(item.row.state!=='sending')this.state.writeState(item.row.id,'sending');
  }
  if(!create.length)return items.length;
  this.beforeWrite();const bulkAt=performance.now();let result;try{result=await this.es.bulk({requestTimeout:5000,refresh:true,body:create.flatMap(i=>[{create:{_index:i.doc._index,_type:'newsTopic',_id:i.doc._id}},i.doc._source])});}catch(e){for(const i of create)this.failItem(i,e.code||'ES5_CREATE_UNCONFIRMED');return this.noRetry?items.length:0;}finally{this.batchProfile.bulkMs=Math.round(performance.now()-bulkAt);}
  if(!Array.isArray(result.items)||result.items.length!==create.length){for(const i of create)this.failItem(i,'ES5_CREATE_RESPONSE_INCOMPLETE');return this.noRetry?items.length:0;}
  const created=[];
  for(const [n,item]of create.entries()){
   const r=result.items[n]?.create;
   if(!r||r._id!==item.doc._id||r._index!==item.doc._index||r._type!=='newsTopic'){this.failItem(item,'ES5_CREATE_IDENTITY_MISMATCH');continue;}
   if(r.status===409){let h;try{h=await this.es.get(apiRef(item.doc));}catch{this.failItem(item,'ES5_CONFLICT_LOOKUP_UNCONFIRMED');continue;}if(!this.same(h,item)){this.state.writeState(item.row.id,'held','ES5_ID_CONFLICT');continue;}this.existing(item,h);continue;}
   if(r.status!==201||r.result!=='created'||!Number.isSafeInteger(r._version)){this.failItem(item,'ES5_CREATE_NOT_CONFIRMED');continue;}
   created.push({...item,createdVersion:r._version});
  }
  // A second read catches a legacy producer racing our create. Compensate only our own unchanged new record.
  if(created.length){const postAt=performance.now();let post;try{post=await this.lookup(created,{targetFirst:false});}catch{for(const i of created)this.failItem(i,'ES5_POST_CREATE_RECONCILIATION_PENDING');return this.noRetry?items.length:0;}finally{this.batchProfile.postLookupMs=Math.round(performance.now()-postAt);}
   for(const item of created){const hits=post.get(item.row.id)?.hits||[];if(hits.length>1){
    try{const own=await this.es.get(apiRef(item.doc));if(own._version!==item.createdVersion||own._source?.ds?.source!=='news-flow-http'||own._source.insertedDate!==item.doc._source.insertedDate){this.state.writeState(item.row.id,'held','ES5_DUPLICATE_RACE_REQUIRES_REVIEW');continue;}
    this.beforeWrite();await this.es.delete({...apiRef(item.doc),version:item.createdVersion,refresh:true});this.state.writeState(item.row.id,'held','OWN_NEW_DOCUMENT_ROLLED_BACK_DUPLICATE_RACE');}catch{this.state.writeState(item.row.id,'held','ES5_DUPLICATE_RACE_REQUIRES_REVIEW');}continue;
   }
   if(hits.length!==1||hits[0]._id!==item.doc._id){this.failItem(item,'ES5_POST_CREATE_IDENTITY_UNCONFIRMED');continue;}
   if(!this.bind(item,item.doc))continue;this.state.writeState(item.row.id,'created');this.onResult({state:'created',id:item.doc._id,index:item.doc._index,url:item.doc._source.url});
  }}
  return items.length;
 }
}
