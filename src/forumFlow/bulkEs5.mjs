// Bounded bulk create with complete identity checks before and after refresh.
import {ForumEs5Sink,forumAliases,forumIdentity,validateForumDocument} from './es5.mjs';
import {legacyForumTopicId} from '../web/newsParser.mjs';
import {recoverForumWriterParents} from './writerRecovery.mjs';
import {selectOriginalTopicCandidate} from './legacyOriginalClock.mjs';
const safeReason=e=>{const code=e.code||e.message?.code;return /^[A-Z0-9_]+$/.test(code||'')?code:/^[A-Z0-9_]+$/.test(e.message||'')?e.message:'FORUM_ES5_WRITE_FAILED';};
const transient=e=>e.statusCode>=400||/Timeout|Connection|NoConnections|ECONN|EPIPE|EAI_AGAIN|ENOTFOUND|RESPONSE_TOO_LARGE|RESPONSE_ABORTED|SEARCH_INCOMPLETE/i.test([e.name,e.code,e.message].join(' '));
const regexpLiteral=value=>value.replace(/[.\\?+*|{}\[\]()"#@&<>~]/g,'\\$&');
export function forumBatchIdentityQuery(items,sites){
 const urls=new Set(),ids=new Set(),groups=new Map();
 for(const item of items){
  const site=sites.get(item.row.site),role=item.doc._type;
  const identity=forumIdentity(item.doc._source.url,role,site);if(!identity)throw Error('FORUM_NATIVE_IDENTITY_UNCONFIRMED');
  for(const alias of forumAliases(item.doc._source.url,site)){urls.add(alias);ids.add(legacyForumTopicId(alias));}
  const number=identity.match(/^(?:topic|post):(\d+)$/)?.[1];if(!number)continue;
  if(!groups.has(site.domain))groups.set(site.domain,{site,numbers:new Set()});groups.get(site.domain).numbers.add(number);
 }
 const clauses=[],urlValues=[...urls],idValues=[...ids];
 // ES5 rewrites large terms/ids sets into Boolean clauses. Keep each set below
 // the cluster's existing 1024 limit, including sites with twelve URL aliases.
 for(let i=0;i<urlValues.length;i+=256)clauses.push({terms:{url:urlValues.slice(i,i+256)}});
 for(let i=0;i<idValues.length;i+=256)clauses.push({ids:{values:idValues.slice(i,i+256)}});
 // One automaton per site recognizes the same host-prefixed numeric candidates
 // as the old per-record wildcard scans. Exact native identity is checked below.
 for(const {site,numbers} of groups.values()){
  const hosts=site.allowedHosts.filter(h=>!h.startsWith('api.')).map(regexpLiteral);
  clauses.push({bool:{filter:[{terms:{siteName:[site.domain,...site.allowedHosts]}},{regexp:{url:{value:'https?://('+hosts.join('|')+')/.*('+[...numbers].join('|')+').*',rewrite:'constant_score',max_determinized_states:10000}}}]}});
 }
 return {bool:{should:clauses,minimum_should_match:1}};
}
export class ForumBulkEs5Sink extends ForumEs5Sink{
 async lookupBatch(items,{allowOriginalSelection=true}={}){
  if(items.length>100){const found=new Map();for(let offset=0;offset<items.length;offset+=100)for(const [key,value]of await this.lookupBatch(items.slice(offset,offset+100),{allowOriginalSelection}))found.set(key,value);return found;}
  const role=items[0].doc._type,query=forumBatchIdentityQuery(items,this.sites);
  for(const item of items)item.identity=forumIdentity(item.doc._source.url,role,this.sites.get(item.row.site));
  const r=await this.es.search({index:'master*',type:role,ignoreUnavailable:true,requestTimeout:120000,filterPath:'timed_out,_shards.failed,hits.total,hits.hits,error.type,error.reason,error.root_cause.type,status',body:{size:4000,timeout:'90s',query:{constant_score:{filter:query}},sort:['_doc'],_source:['url','siteName','publishedDate','parentId','parentDate']}});
  if(r.timed_out||r._shards?.failed||!Array.isArray(r.hits?.hits)||r.hits.total>r.hits.hits.length)throw Error('FORUM_IDENTITY_SEARCH_INCOMPLETE');
  return new Map(items.map(item=>{const key=item.row.site+'|'+item.row.native_id,site=this.sites.get(item.row.site),hits=r.hits.hits.filter(h=>forumIdentity(h._source?.url,h._type,site)===item.identity);if(hits.some(h=>![site.domain,...site.allowedHosts].includes(h._source.siteName)))return [key,{reason:'FORUM_SITE_IDENTITY_CONFLICT'}];if(hits.length>1){const selected=allowOriginalSelection&&selectOriginalTopicCandidate(hits,item.doc,item.proof,site);return selected?[key,{hit:selected}]:[key,{reason:'FORUM_EXISTING_DUPLICATE_IDENTITIES'}];}return [key,{hit:hits[0]||null}];}));
 }
 async flush(limit=100,{onResult=()=>{},oneTopicPerSite=false}={}){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('FORUM_INVALID_BATCH_LIMIT');
  if(oneTopicPerSite)return super.flush(limit,{onResult,oneTopicPerSite});
  if(!this.ready)await this.initialize();const db=this.state.db;this.recoveryLast=this.write?recoverForumWriterParents(this.state,this.beforeWrite):{promotedParents:0,requeuedComments:0};
  const first=db.prepare("SELECT role FROM forum_documents WHERE export_state='pending' ORDER BY CASE WHEN role='forumTopic' THEN 0 ELSE 1 END LIMIT 1").get();if(!first)return [];
  const rows=db.prepare("SELECT * FROM forum_documents WHERE export_state='pending' AND role=? ORDER BY site,native_id LIMIT ?").all(first.role,limit),results=[];
  const finish=(item,status,reason=null,hit=null)=>{if(hit)this.bind(item.row,hit);if(!this.write&&item.doc._type==='forumTopic'&&status==='dry_run_create')this.plannedParents.set(item.row.site+'|'+item.row.thread_id,{es_id:item.doc._id,published:item.doc._source.publishedDate});if(this.write&&status!=='deferred'){this.beforeWrite();db.prepare('UPDATE forum_documents SET export_state=?,export_reason=? WHERE site=? AND role=? AND native_id=?').run(status,reason,item.row.site,item.row.role,item.row.native_id);}const r={site:item.row.site,nativeId:item.row.native_id,status,reason};results.push(r);onResult(r);};
  const items=[];
  for(const row of rows){const item={row,doc:JSON.parse(row.doc),proof:JSON.parse(row.proof)};const site=this.sites.get(row.site);try{
   if(!site)throw Error('FORUM_SITE_NOT_ALLOWED');
   const since=Number(db.prepare("SELECT value FROM forum_meta WHERE key='since'").get().value);
   if(row.role==='forumTopic'&&Date.parse(item.doc._source.publishedDate)<since&&!db.prepare("SELECT 1 FROM forum_documents WHERE site=? AND role='forumComment' AND thread_id=? LIMIT 1").get(row.site,row.thread_id)){finish(item,'context_only');continue;}
   if(row.role==='forumComment'){const parent=db.prepare("SELECT * FROM forum_es_bindings WHERE site=? AND role='forumTopic' AND native_id=?").get(row.site,row.thread_id);if(!parent){const original=db.prepare("SELECT export_state FROM forum_documents WHERE site=? AND role='forumTopic' AND thread_id=?").get(row.site,row.thread_id);if(original&&['pending','context_only'].includes(original.export_state)){finish(item,'deferred','FORUM_PARENT_AWAITING_EXPORT');continue;}throw Error('FORUM_PARENT_NOT_RECONCILED');}const original=db.prepare("SELECT doc FROM forum_documents WHERE site=? AND role='forumTopic' AND thread_id=?").get(row.site,row.thread_id);if(!original)throw Error('FORUM_ORIGINAL_PARENT_REQUIRED');item.parentUrl=JSON.parse(original.doc)._source.url;item.parentBinding=parent;item.doc._source.parentId=parent.es_id;item.doc._source.parentDate=parent.published;}
   if(!item.proof.time?.raw||item.proof.time.publishedDate!==item.doc._source.publishedDate)throw Error('FORUM_TIME_PROOF_REQUIRED');items.push(item);
  }catch(e){finish(item,'held',safeReason(e));}}
  if(!items.length)return results;
  if(first.role==='forumComment'){
   const refs=new Map(items.map(i=>[i.parentBinding.es_index+'|'+i.parentBinding.es_id,i.parentBinding]));let response;
   try{response=await this.es.mget({body:{docs:[...refs.values()].map(b=>({_index:b.es_index,_type:'forumTopic',_id:b.es_id,_source:['url','siteName','publishedDate']}))}});if(!Array.isArray(response.docs)||response.docs.length!==refs.size)throw Error('FORUM_ES_PARENT_READ_INCOMPLETE');}catch{for(const i of items)finish(i,'deferred','FORUM_ES_PARENT_READ_UNCONFIRMED');return results;}
   const parents=new Map(response.docs.map(h=>[h._index+'|'+h._id,h])),ready=[];
   for(const i of items){const b=i.parentBinding,h=parents.get(b.es_index+'|'+b.es_id),site=this.sites.get(i.row.site);if(!h?.found||Date.parse(h._source?.publishedDate)!==Date.parse(b.published)){finish(i,'deferred','FORUM_ES_PARENT_CHANGED_OR_MISSING');continue;}if(!site.allowedHosts.includes(h._source.siteName)||forumIdentity(h._source.url,'forumTopic',site)!==forumIdentity(i.parentUrl,'forumTopic',site)){finish(i,'held','FORUM_ES_PARENT_IDENTITY_MISMATCH');continue;}ready.push(i);}
   items.splice(0,items.length,...ready);if(!items.length)return results;
  }
  let found;try{found=await this.lookupBatch(items);}catch(e){for(const i of items)finish(i,transient(e)?'deferred':'held',safeReason(e));return results;}
  const create=[];
  for(const i of items){const lookup=found.get(i.row.site+'|'+i.row.native_id);try{if(lookup.reason)throw Error(lookup.reason);if(lookup.hit){this.verifyExisting(lookup.hit,i.doc,i.proof);finish(i,'existing',null,lookup.hit);continue;}validateForumDocument(i.doc,i.proof,await this.mapping(i.doc));if(!this.write){finish(i,'dry_run_create');continue;}create.push(i);}catch(e){finish(i,'held',safeReason(e));}}
  if(!create.length)return results;
  this.beforeWrite();let r;try{r=await this.es.bulk({requestTimeout:120000,refresh:true,body:create.flatMap(i=>[{create:{_index:i.doc._index,_type:i.doc._type,_id:i.doc._id}},i.doc._source])});}catch(e){for(const i of create)finish(i,'deferred','FORUM_CREATE_RESPONSE_UNCONFIRMED');return results;}
  if(!Array.isArray(r.items)||r.items.length!==create.length){for(const i of create)finish(i,'deferred','FORUM_CREATE_RESPONSE_INCOMPLETE');return results;}
  const verify=[];
  for(const [n,i]of create.entries()){const result=r.items[n]?.create;i.createResult=result;
   if(!result||result._id!==i.doc._id||result._index!==i.doc._index||result._type!==i.doc._type){finish(i,'held','FORUM_CREATE_IDENTITY_MISMATCH');continue;}
   if(result.status!==409&&!(result.status===201&&result.result==='created'&&Number.isInteger(result._version))){finish(i,result.status===429||result.status>=500?'deferred':'held','FORUM_CREATE_FAILED_'+result.status);continue;}verify.push(i);
  }
  if(!verify.length)return results;
  let post;try{post=await this.lookupBatch(verify,{allowOriginalSelection:false});}catch(e){for(const i of verify)finish(i,'deferred','FORUM_POST_CREATE_UNCONFIRMED');return results;}
  for(const i of verify){const lookup=post.get(i.row.site+'|'+i.row.native_id);try{
   if(lookup.reason){
    if(lookup.reason==='FORUM_EXISTING_DUPLICATE_IDENTITIES'&&i.createResult.status===201){const own=await this.es.get({index:i.doc._index,type:i.doc._type,id:i.doc._id});if(own._version===i.createResult._version&&own._source?.ds?.source==='forum-flow-http'&&own._source.insertedDate===i.doc._source.insertedDate){this.beforeWrite();await this.es.delete({index:i.doc._index,type:i.doc._type,id:i.doc._id,version:i.createResult._version,refresh:true});throw Error('FORUM_OWN_CREATE_ROLLED_BACK_DUPLICATE_RACE');}}
    throw Error(lookup.reason);
   }
   if(!lookup.hit||i.createResult.status===201&&(lookup.hit._id!==i.doc._id||lookup.hit._index!==i.doc._index))throw Error('FORUM_POST_CREATE_IDENTITY_UNCONFIRMED');this.verifyExisting(lookup.hit,i.doc,i.proof);finish(i,i.createResult.status===201?'created':'existing',null,lookup.hit);
  }catch(e){finish(i,'held',safeReason(e));}}
  return results;
 }
}
