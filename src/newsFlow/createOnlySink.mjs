import {NewsEs5Sink} from './es5.mjs';
import {validateNewsMapping} from './identity.mjs';
import {newsSqliteTransaction} from './sqliteContention.mjs';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const merge=(a,b)=>Object.fromEntries([...new Set([...Object.keys(a||{}),...Object.keys(b||{})])].map(k=>[k,object(a?.[k])&&object(b?.[k])?merge(a[k],b[k]):b?.[k]??a?.[k]]));
const matches=(pattern,index)=>typeof pattern==='string'&&new RegExp('^'+pattern.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(index);

// Flow 3 sends create directly. A 409 is a successful existing document;
// neither successful path performs search, mget, get, index, update or delete.
export class NewsCreateOnlySink extends NewsEs5Sink{
 localWrite(callback,operation){return newsSqliteTransaction(this.state,callback,{operation,guard:()=>this.beforeWrite(),onWait:details=>this.onSqliteWait?.({operation,...details})});}
 async mapping(doc){
  try{return await super.mapping(doc);}catch(e){
   if(e.statusCode!==404||e.body?.error?.type!=='index_not_found_exception')throw e;
   // A missing weekly index is created by ES from its existing templates.
   // Validate against those templates without creating or modifying any mapping.
   const templates=this.createTemplates??=await this.es.indices.getTemplate({name:'*'});
   if(!matches(templates.master?.template,doc._index))throw Object.assign(Error(),{code:'ES5_MASTER_TEMPLATE_UNCONFIRMED'});
   const selected=Object.values(templates).filter(t=>matches(t.template,doc._index)).sort((a,b)=>(a.order||0)-(b.order||0));let defaults={},typed={};
   for(const t of selected){defaults=merge(defaults,t.mappings?._default_?.properties||{});typed=merge(typed,t.mappings?.newsTopic?.properties||{});}
   const properties=merge(defaults,typed);this.mappings.set(doc._index,properties);return properties;
  }
 }
 async flush(limit=100){
  if(!this.write)throw Error('NEWS_DIRECT_IMPORT_REQUIRES_WRITE_MODE');
  if(!this.ready)await this.initialize();
  const started=performance.now(),profile={event:'es_import_batch',directCreate:true},selected=performance.now(),rows=await this.localWrite(()=>this.state.claimWrites(limit),'claim_writes');
  profile.items=rows.length;profile.selectMs=Math.round(performance.now()-selected);if(!rows.length)return 0;
  const hold=(row,reason)=>this.localWrite(()=>{this.state.writeState(row.id,'held',reason);this.onResult({state:'held',id:row.id,reason});},'hold_write');
  const items=[],batchMappings=new Map();
  try{
   const validateAt=performance.now();
   for(const row of rows){
    let doc;try{doc=JSON.parse(row.doc);if(!this.publicationVerified(doc,JSON.parse(row.config)))throw Object.assign(Error(),{code:'NEWS_PUBLICATION_PROOF_REQUIRED'});if(!doc?._source||doc._type!=='newsTopic'||!/^master\d{6}$/.test(doc._index)||!/^[a-f0-9]{32}$/.test(doc._id))throw Object.assign(Error(),{code:'ES5_NEWS_IDENTITY_INVALID'});
     if(!batchMappings.has(doc._index)){try{batchMappings.set(doc._index,{properties:await this.mapping(doc)});}catch(e){batchMappings.set(doc._index,{error:e.code||'ES5_MAPPING_UNAVAILABLE'});}}
     const mapping=batchMappings.get(doc._index);if(mapping.error){await hold(row,mapping.error);continue;}
     validateNewsMapping(doc,mapping.properties);items.push({row,doc});
    }catch(e){if(e.code==='ERR_SQLITE_ERROR'||e.message==='NEWS_SQLITE_TRANSACTION_NOT_REPLAYABLE')throw e;await hold(row,e.code||'ES5_INVALID_OUTBOX_DOCUMENT');}
   }
   profile.validateMs=Math.round(performance.now()-validateAt);if(!items.length)return rows.length;
   this.beforeWrite();const bulkAt=performance.now();let result;
   try{result=await this.es.bulk({requestTimeout:5000,refresh:false,body:items.flatMap(i=>[{create:{_index:i.doc._index,_type:'newsTopic',_id:i.doc._id}},i.doc._source])});}
   catch(e){for(const i of items)await hold(i.row,e.code||'ES5_CREATE_UNCONFIRMED');return rows.length;}
   finally{profile.bulkMs=Math.round(performance.now()-bulkAt);}
   if(!Array.isArray(result.items)||result.items.length!==items.length){for(const i of items)await hold(i.row,'ES5_CREATE_RESPONSE_INCOMPLETE');return rows.length;}
   const finalizeAt=performance.now();this.beforeWrite();let created=0,existing=0,held=0;
   await this.localWrite(()=>{for(const [n,item] of items.entries()){
    const r=result.items[n]?.create;
    if(!r||r._id!==item.doc._id||r._index!==item.doc._index||r._type!=='newsTopic'){this.state.writeState(item.row.id,'held','ES5_CREATE_IDENTITY_MISMATCH');this.onResult({state:'held',id:item.row.id,reason:'ES5_CREATE_IDENTITY_MISMATCH'});held++;continue;}
    const status=r.status===409?'existing':r.status===201&&r.result==='created'&&Number.isSafeInteger(r._version)&&r._version>0?'created':null;
    if(!status){const reason='ES5_CREATE_FAILED_'+(Number.isInteger(r.status)?r.status:'UNKNOWN');this.state.writeState(item.row.id,'held',reason);this.onResult({state:'held',id:item.row.id,reason});held++;continue;}
    if(!this.state.confirmDirectWrite(item.row.id,item.doc,status))continue;
    if(status==='created')created++;else existing++;
    this.onResult({state:status,id:item.doc._id,index:item.doc._index,url:item.doc._source.url});
   }},'confirm_writes');
   Object.assign(profile,{created,existing,held,finalizeMs:Math.round(performance.now()-finalizeAt)});return rows.length;
  }finally{this.onBatch({...profile,totalMs:Math.round(performance.now()-started)});}
 }
}
