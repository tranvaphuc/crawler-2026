import {createHash} from 'node:crypto';import {legacyForumTopicId,weeklyIndex} from '../web/newsParser.mjs';import {topicUrl,nativeThreadId} from './adapters.mjs';
import {provenLegacyMinuteMatch,selectOriginalTopicCandidate} from './legacyOriginalClock.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function forumAliases(raw,site){const source=new URL(raw),out=new Set([raw]);for(const host of site.allowedHosts.filter(h=>!h.startsWith('api.')))for(const protocol of ['http:','https:'])for(const slash of [false,true]){const u=new URL(source);u.hostname=host;u.protocol=protocol;u.pathname=u.pathname.replace(/\/$/,'')+(slash?'/':'');out.add(u.href);}return [...out];}
export function forumIdentity(raw,type,site){try{const u=new URL(raw);if(!site.allowedHosts.includes(u.hostname))return null;
 if(type==='forumComment'){if(site.adapter==='pantip'){const m=u.pathname.match(/^\/topic\/(\d+)\/comment(\d+(?:-\d+)?)\/?$/);return m?'pantip:'+m[1]+':'+m[2]:null;}const post=(u.hash.match(/^#(?:post-|comment-)(\d+)$/)||u.pathname.match(/\/(?:post-|posts\/)(\d+)\/?$/))?.[1];return post?'post:'+post:null;}
 if(site.adapter==='wordpress'){
  // WordPress uses numeric slug suffixes for unrelated articles, not post IDs.
  const pathname=u.pathname.replace(/\/+$/,'');
  if(pathname)return 'url:'+pathname;
  const post=u.searchParams.get('p');
  return /^\d+$/.test(post||'')?'url:/?p='+post:null;
 }
 const id=nativeThreadId(topicUrl(raw,site));return id?'topic:'+id:'url:'+u.pathname.replace(/\/$/,'');
 }catch{return null;}}
export function validateForumDocument(doc,proof,properties){
 if(!['forumTopic','forumComment'].includes(doc._type)||!/^master\d{6}$/.test(doc._index)||!/^[a-f0-9]{32}$/.test(doc._id)||doc._index!==weeklyIndex(doc._source.publishedDate))throw Error('FORUM_ES_IDENTITY_INVALID');
 if(!proof.time?.raw||!['second','minute'].includes(proof.time.precision)||proof.time.publishedDate!==doc._source.publishedDate)throw Error('FORUM_TIME_PROOF_REQUIRED');
 const expected={siteId:'keyword',siteName:'keyword',title:'text',url:'keyword',author:'keyword',authorId:'keyword',content:'text',publishedDate:'date',insertedDate:'date',parentDate:'date',parentId:'keyword',picture:'keyword',ds:'object'};
 for(const key of ['siteId','siteName','title','url','author','authorId','content','publishedDate','insertedDate'])if(typeof doc._source[key]!=='string'||!doc._source[key])throw Error('FORUM_REQUIRED_FIELD_'+key);
 if(doc._type==='forumComment'&&(!doc._source.parentId||!doc._source.parentDate))throw Error('FORUM_PARENT_REQUIRED');
 for(const [key,value]of Object.entries(doc._source)){const m=properties[key],type=m?.properties?'object':m?.type;if(!m||expected[key]!==type)throw Error('FORUM_MAPPING_CHANGED_'+key);if(type==='date'&&!Number.isFinite(Date.parse(value)))throw Error('FORUM_DATE_INVALID');if(['text','keyword'].includes(type)&&typeof value!=='string')throw Error('FORUM_FIELD_INVALID');if(type==='object'&&Object.entries(value).some(([k,v])=>!m.properties[k]||typeof v!=='string'))throw Error('FORUM_OBJECT_MAPPING_CHANGED');}
 return true;
}
export class ForumEs5Sink{
 constructor({es,state,sites,proof,write=false,beforeWrite=()=>{}}){Object.assign(this,{es,state,sites:new Map(sites.map(s=>[s.domain,s])),proof,write,beforeWrite});this.ready=false;this.mappings=new Map();this.plannedParents=new Map();state.db.exec(`CREATE TABLE IF NOT EXISTS forum_es_bindings(site TEXT,role TEXT,native_id TEXT,es_index TEXT,es_id TEXT,published TEXT,PRIMARY KEY(site,role,native_id));`);const cols=new Set(state.db.prepare('PRAGMA table_info(forum_documents)').all().map(x=>x.name));if(!cols.has('export_reason'))state.db.exec('ALTER TABLE forum_documents ADD COLUMN export_reason TEXT');}
 async initialize(){const info=await this.es.info();if(!this.proof?.verified||!String(info.version.number).startsWith('5.6.')||this.proof.clusterFingerprint!==sha(info.cluster_uuid))throw Error('FORUM_ES5_PROOF_REQUIRED');this.ready=true;}
 async mapping(doc){const key=doc._index+'|'+doc._type;if(this.mappings.has(key))return this.mappings.get(key);let props;try{const result=await this.es.indices.getMapping({index:doc._index});const mappings=result[doc._index]?.mappings;props=mappings?.[doc._type]?.properties||mappings?._default_?.properties;}catch(e){if(e.statusCode!==404)throw e;const templates=await this.es.indices.getTemplate({name:'master'});const master=templates.master;if(master?.template!=='master*')throw Error('FORUM_MASTER_TEMPLATE_UNVERIFIED');props={...master.mappings?._default_?.properties,...master.mappings?.[doc._type]?.properties};}if(!props||!Object.keys(props).length)throw Error('FORUM_ES5_MAPPING_MISSING');this.mappings.set(key,props);return props;}
 async lookup(doc,site,proof,{allowOriginalSelection=true}={}){
  const aliases=forumAliases(doc._source.url,site),id=forumIdentity(doc._source.url,doc._type,site);if(!id)throw Error('FORUM_NATIVE_IDENTITY_UNCONFIRMED');
  const clauses=[{terms:{url:aliases}},{ids:{values:aliases.map(legacyForumTopicId)}}];
  // Namespace-constrained native lookup retains existing IDs across slug, scheme,
  // www and the observed Otofun hostname migration. Never choose the first hit.
  const number=id.match(/^(?:topic|post):(\d+)$/)?.[1];
  if(number)clauses.push({bool:{filter:[{terms:{siteName:[site.domain,...site.allowedHosts]}},{bool:{should:site.allowedHosts.filter(h=>!h.startsWith('api.')).flatMap(h=>['http://','https://'].map(p=>({wildcard:{url:p+h+'/*'+number+'*'}}))),minimum_should_match:1}}]}});
  const r=await this.es.search({index:'master*',type:doc._type,ignoreUnavailable:true,body:{size:200,timeout:'15s',query:{bool:{should:clauses,minimum_should_match:1}},_source:['url','siteName','publishedDate','parentId','parentDate']}});
  if(r.timed_out||r._shards?.failed||!Array.isArray(r.hits?.hits)||r.hits.total>r.hits.hits.length)throw Error('FORUM_IDENTITY_SEARCH_INCOMPLETE');
  let hits=r.hits.hits.filter(h=>forumIdentity(h._source?.url,h._type,site)===id);if(hits.some(h=>![site.domain,...site.allowedHosts].includes(h._source.siteName)))throw Error('FORUM_SITE_IDENTITY_CONFLICT');if(hits.length>1){const selected=allowOriginalSelection&&selectOriginalTopicCandidate(hits,doc,proof,site);if(!selected)throw Error('FORUM_EXISTING_DUPLICATE_IDENTITIES');hits=[selected];}
  if(hits.some(h=>![site.domain,...site.allowedHosts].includes(h._source.siteName)))throw Error('FORUM_SITE_IDENTITY_CONFLICT');return hits[0]||null;
 }
 bind(row,hit){if(this.write)this.beforeWrite();this.state.db.prepare('INSERT OR REPLACE INTO forum_es_bindings VALUES(?,?,?,?,?,?)').run(row.site,row.role,row.role==='forumTopic'?row.thread_id:row.native_id,hit._index,hit._id,hit._source.publishedDate);}
 verifyExisting(existing,doc,proof){const unit=proof.time.precision==='minute'?60000:1000;if(Math.floor(Date.parse(existing._source.publishedDate)/unit)!==Math.floor(Date.parse(doc._source.publishedDate)/unit)&&!provenLegacyMinuteMatch(existing,doc,proof,this.sites.get(doc._source.siteName)))throw Error('FORUM_EXISTING_PUBLICATION_TIME_DIFFERS');if(doc._type==='forumComment'&&(existing._source.parentId!==doc._source.parentId||Date.parse(existing._source.parentDate)!==Date.parse(doc._source.parentDate)))throw Error('FORUM_EXISTING_PARENT_DIFFERS');}
 async one(row){
  const site=this.sites.get(row.site);if(!site)return {status:'skipped'};const doc=JSON.parse(row.doc),proof=JSON.parse(row.proof);
  const since=Number(this.state.db.prepare("SELECT value FROM forum_meta WHERE key='since'").get()?.value||Date.parse('2026-10-01T00:00:00+07:00'));
  if(row.role==='forumTopic'&&Date.parse(doc._source.publishedDate)<since&&!this.state.db.prepare("SELECT 1 FROM forum_documents WHERE site=? AND role='forumComment' AND thread_id=? LIMIT 1").get(row.site,row.thread_id))return {status:'context_only'};
  // Validate shape/time before querying; validate actual target mapping only when
  // creating. Historical identities may already live in a different index.
  if(!proof.time?.raw||proof.time.publishedDate!==doc._source.publishedDate)throw Error('FORUM_TIME_PROOF_REQUIRED');
  if(doc._type==='forumComment'){
   const parent=this.state.db.prepare("SELECT * FROM forum_es_bindings WHERE site=? AND role='forumTopic' AND native_id=?").get(row.site,row.thread_id)||(!this.write?this.plannedParents.get(row.site+'|'+row.thread_id):null);if(!parent)throw Error('FORUM_PARENT_NOT_RECONCILED');doc._source.parentId=parent.es_id;doc._source.parentDate=parent.published;
  }
  const existing=await this.lookup(doc,site,proof);
  if(existing){this.verifyExisting(existing,doc,proof);this.bind(row,existing);return {status:'existing',id:existing._id,index:existing._index};}
  validateForumDocument(doc,proof,await this.mapping(doc));
  if(!this.write){if(doc._type==='forumTopic')this.plannedParents.set(row.site+'|'+row.thread_id,{es_id:doc._id,published:doc._source.publishedDate});return {status:'dry_run_create',id:doc._id,index:doc._index};}
  // Existing master indices refresh every 60s, exceeding the 30s RPC deadline.
  // Explicit refresh confirms this low-volume create without a false timeout.
  this.beforeWrite();let response;try{response=await this.es.create({index:doc._index,type:doc._type,id:doc._id,body:doc._source,refresh:true});}catch(e){if(e.statusCode!==409)throw e;const hit=await this.lookup(doc,site,proof);if(!hit)throw Error('FORUM_CREATE_CONFLICT_UNCONFIRMED');this.verifyExisting(hit,doc,proof);this.bind(row,hit);return {status:'existing',id:hit._id,index:hit._index};}
  if(response.result!=='created'||response._id!==doc._id||response._index!==doc._index||response._type!==doc._type)throw Error('FORUM_CREATE_UNCONFIRMED');
  // Check aliases again after refresh to detect a legacy producer racing us.
  try{const hit=await this.lookup(doc,site,proof,{allowOriginalSelection:false});if(!hit||hit._id!==doc._id||hit._index!==doc._index)throw Error('FORUM_POST_CREATE_IDENTITY_UNCONFIRMED');this.verifyExisting(hit,doc,proof);}catch(e){
   if(e.message==='FORUM_EXISTING_DUPLICATE_IDENTITIES'&&Number.isInteger(response._version)){const own=await this.es.get({index:doc._index,type:doc._type,id:doc._id});if(own._version===response._version&&own._source?.ds?.source==='forum-flow-http'&&own._source.insertedDate===doc._source.insertedDate){this.beforeWrite();await this.es.delete({index:doc._index,type:doc._type,id:doc._id,version:response._version,refresh:true});throw Error('FORUM_OWN_CREATE_ROLLED_BACK_DUPLICATE_RACE');}}
   throw e;
  }
  this.bind(row,doc);return {status:'created',id:doc._id,index:doc._index};
 }
 async flush(limit=50,{oneTopicPerSite=false,onResult=()=>{}}={}){if(!this.ready)await this.initialize();const rows=this.state.db.prepare(oneTopicPerSite?"SELECT * FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY site ORDER BY native_id) n FROM forum_documents WHERE export_state='pending' AND role='forumTopic') WHERE n=1 ORDER BY site LIMIT ?":"SELECT * FROM forum_documents WHERE export_state='pending' ORDER BY CASE WHEN role='forumTopic' THEN 0 ELSE 1 END,site,native_id LIMIT ?").all(limit);const results=[];for(const row of rows){let result;try{const r=await this.one(row);if(r.status!=='skipped'&&this.write)this.state.db.prepare('UPDATE forum_documents SET export_state=?,export_reason=NULL WHERE site=? AND role=? AND native_id=?').run(r.status,row.site,row.role,row.native_id);result={site:row.site,nativeId:row.native_id,...r};}catch(e){const reason=e.code||(/^[A-Z0-9_]+$/.test(e.message)?e.message:'FORUM_ES5_WRITE_FAILED');if(this.write)this.state.db.prepare("UPDATE forum_documents SET export_state='held',export_reason=? WHERE site=? AND role=? AND native_id=?").run(reason,row.site,row.role,row.native_id);result={site:row.site,nativeId:row.native_id,status:'held',reason};}results.push(result);onResult(result);}return results;}
}
