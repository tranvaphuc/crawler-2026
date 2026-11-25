// Isolated one-off batching; production collector/writer modules remain unchanged.
import {ForumEs5Sink,forumAliases,forumIdentity,validateForumDocument} from '../src/forumFlow/es5.mjs';
import {legacyForumTopicId} from '../src/web/newsParser.mjs';
import {isDeepStrictEqual} from 'node:util';
export class BrandHotfixSink extends ForumEs5Sink{
 async lookupBatch(items){
  const role=items[0].doc._type,clauses=[],groups=new Map();
  for(const item of items){const site=this.sites.get(item.row.site),aliases=forumAliases(item.doc._source.url,site);item.identity=forumIdentity(item.doc._source.url,role,site);if(!item.identity)throw Error('HOTFIX_NATIVE_IDENTITY_UNCONFIRMED');
   clauses.push({terms:{url:aliases}},{ids:{values:aliases.map(legacyForumTopicId)}});const number=item.identity.match(/^(?:topic|post):(\d+)$/)?.[1];
   if(number){if(!groups.has(site.domain))groups.set(site.domain,{site,numbers:new Set()});groups.get(site.domain).numbers.add(number);}
  }
  for(const {site,numbers}of groups.values()){const hosts=site.allowedHosts.filter(h=>!h.startsWith('api.')).map(h=>h.replaceAll('.','\\.'));clauses.push({bool:{filter:[{terms:{siteName:[site.domain,...site.allowedHosts]}},{regexp:{url:{value:'https?://('+hosts.join('|')+')/.*('+[...numbers].join('|')+').*',flags:'NONE',max_determinized_states:10000}}}]}});}
  const r=await this.es.search({index:'master*',type:role,ignoreUnavailable:true,body:{size:4000,timeout:'15s',query:{bool:{should:clauses,minimum_should_match:1}},_source:['url','siteName','publishedDate','parentId','parentDate']}});
  if(r.timed_out||r._shards?.failed||!Array.isArray(r.hits?.hits)||r.hits.total>r.hits.hits.length)throw Error('HOTFIX_IDENTITY_SEARCH_INCOMPLETE');
  return new Map(items.map(item=>{const key=item.row.site+'|'+item.row.native_id,site=this.sites.get(item.row.site),hits=r.hits.hits.filter(h=>forumIdentity(h._source?.url,h._type,site)===item.identity);if(hits.length>1)return [key,{reason:'FORUM_EXISTING_DUPLICATE_IDENTITIES'}];if(hits.some(h=>![site.domain,...site.allowedHosts].includes(h._source.siteName)))return [key,{reason:'FORUM_SITE_IDENTITY_CONFLICT'}];return [key,{hit:hits[0]||null}];}));
 }
 async flush(limit=20,{onResult=()=>{}}={}){
  if(!this.ready)await this.initialize();const db=this.state.db;
  const first=db.prepare("SELECT role FROM forum_documents WHERE export_state='pending' ORDER BY CASE WHEN role='forumTopic' THEN 0 ELSE 1 END LIMIT 1").get();if(!first)return [];
  const rows=db.prepare("SELECT * FROM forum_documents WHERE export_state='pending' AND role=? ORDER BY site,native_id LIMIT ?").all(first.role,limit),results=[];
  const finish=(item,status,reason=null,hit=null)=>{if(hit)this.bind(item.row,hit);if(this.write){this.beforeWrite();db.prepare('UPDATE forum_documents SET export_state=?,export_reason=? WHERE site=? AND role=? AND native_id=?').run(status,reason,item.row.site,item.row.role,item.row.native_id);}const r={site:item.row.site,nativeId:item.row.native_id,status,reason};results.push(r);onResult(r);};
  const items=[];
  for(const row of rows){const item={row,doc:JSON.parse(row.doc),proof:JSON.parse(row.proof)};const site=this.sites.get(row.site);try{
   if(!site)throw Error('HOTFIX_SITE_NOT_ALLOWED');
   const since=Number(db.prepare("SELECT value FROM forum_meta WHERE key='since'").get().value);
   if(row.role==='forumTopic'&&Date.parse(item.doc._source.publishedDate)<since&&!db.prepare("SELECT 1 FROM forum_documents WHERE site=? AND role='forumComment' AND thread_id=? LIMIT 1").get(row.site,row.thread_id)){finish(item,'context_only');continue;}
   if(row.role==='forumComment'){const parent=db.prepare("SELECT * FROM forum_es_bindings WHERE site=? AND role='forumTopic' AND native_id=?").get(row.site,row.thread_id);if(!parent)throw Error('FORUM_PARENT_NOT_RECONCILED');item.doc._source.parentId=parent.es_id;item.doc._source.parentDate=parent.published;}
   if(!item.proof.time?.raw||item.proof.time.publishedDate!==item.doc._source.publishedDate)throw Error('FORUM_TIME_PROOF_REQUIRED');items.push(item);
  }catch(e){finish(item,'held',e.message);}}
  if(!items.length)return results;
  let found;try{found=await this.lookupBatch(items);}catch(e){for(const i of items)finish(i,'held',e.message);return results;}
  const create=[];
  for(const i of items){const lookup=found.get(i.row.site+'|'+i.row.native_id);try{if(lookup.reason)throw Error(lookup.reason);if(lookup.hit){this.verifyExisting(lookup.hit,i.doc,i.proof);let recovered=false;if(i.row.export_reason==='HOTFIX_POST_CREATE_UNCONFIRMED'&&lookup.hit._id===i.doc._id&&lookup.hit._index===i.doc._index){const own=await this.es.get({index:i.doc._index,type:i.doc._type,id:i.doc._id});recovered=own._version===1&&isDeepStrictEqual(own._source,i.doc._source);}finish(i,recovered?'created':'existing',recovered?'HOTFIX_RECOVERED_OWN_CREATE':null,lookup.hit);continue;}validateForumDocument(i.doc,i.proof,await this.mapping(i.doc));if(!this.write){finish(i,'dry_run_create');continue;}create.push(i);}catch(e){finish(i,'held',e.message);}}
  if(!create.length)return results;
  this.beforeWrite();let r;try{r=await this.es.bulk({requestTimeout:30000,refresh:true,body:create.flatMap(i=>[{create:{_index:i.doc._index,_type:i.doc._type,_id:i.doc._id}},i.doc._source])});}catch(e){for(const i of create)finish(i,'held','HOTFIX_CREATE_RESPONSE_UNCONFIRMED');return results;}
  if(!Array.isArray(r.items)||r.items.length!==create.length){for(const i of create)finish(i,'held','HOTFIX_CREATE_RESPONSE_INCOMPLETE');return results;}
  const verify=[];
  for(const [n,i]of create.entries()){const result=r.items[n]?.create;i.createResult=result;
   if(!result||result._id!==i.doc._id||result._index!==i.doc._index||result._type!==i.doc._type){finish(i,'held','HOTFIX_CREATE_IDENTITY_MISMATCH');continue;}
   if(result.status!==409&&!(result.status===201&&result.result==='created'&&Number.isInteger(result._version))){finish(i,'held','HOTFIX_CREATE_FAILED_'+result.status);continue;}verify.push(i);
  }
  if(!verify.length)return results;
  let post;try{post=await this.lookupBatch(verify);}catch(e){for(const i of verify)finish(i,'held','HOTFIX_POST_CREATE_UNCONFIRMED');return results;}
  for(const i of verify){const lookup=post.get(i.row.site+'|'+i.row.native_id);try{
   if(lookup.reason){
    if(lookup.reason==='FORUM_EXISTING_DUPLICATE_IDENTITIES'&&i.createResult.status===201){const own=await this.es.get({index:i.doc._index,type:i.doc._type,id:i.doc._id});if(own._version===i.createResult._version&&own._source?.ds?.source==='forum-flow-http'&&own._source.insertedDate===i.doc._source.insertedDate){this.beforeWrite();await this.es.delete({index:i.doc._index,type:i.doc._type,id:i.doc._id,version:i.createResult._version,refresh:true});throw Error('HOTFIX_OWN_CREATE_ROLLED_BACK_DUPLICATE_RACE');}}
    throw Error(lookup.reason);
   }
   if(!lookup.hit)throw Error('HOTFIX_POST_CREATE_IDENTITY_UNCONFIRMED');this.verifyExisting(lookup.hit,i.doc,i.proof);finish(i,i.createResult.status===201?'created':'existing',null,lookup.hit);
  }catch(e){finish(i,'held',e.message);}}
  return results;
 }
}
