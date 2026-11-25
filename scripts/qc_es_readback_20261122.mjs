import fs from 'node:fs';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
const news=fs.existsSync('/opt/news-flow/current'),flow=news?'news':'forum',base='/opt/'+flow+'-flow/current',root='/var/lib/'+flow+'-flow/qc-20261122',require=createRequire(base+'/package.json'),dotenv=require('dotenv'),ES=require('elasticsearch');
const env=dotenv.parse(fs.readFileSync('/etc/'+flow+'-flow/'+flow+'.env')),es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',log:[],maxRetries:0,requestTimeout:60000});
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const result={at:new Date().toISOString(),flow,checked:0,errors:[],parentsChecked:0,parentsUnchanged:0};
try{
 if(news){
  const resolved=JSON.parse(fs.readFileSync(root+'/news-import-resolution.json')).resolved;
  for(const row of resolved){const h=await es.get({index:row.index,type:'newsTopic',id:row.id});result.checked++;if(h._source.publishedDate!==row.finalESDate||hash(h._source)!==row.sourceHash)result.errors.push({id:row.id,reason:'NEWS_READBACK_CHANGED'});}
 }else{
  const db=new DatabaseSync('/var/lib/forum-flow/runtime/state.sqlite',{readOnly:true}),prior=new DatabaseSync('/var/backups/forum-flow/qc-20261121-1795279708/state.sqlite',{readOnly:true}),sites=new Map(JSON.parse(fs.readFileSync(base+'/config/forum-flow/sites.json')).map(s=>[s.domain,s]));
  const {ForumEs5Sink,forumIdentity}=await import('file://'+base+'/src/forumFlow/es5.mjs');
  const rows=prior.prepare("SELECT site,role,native_id FROM forum_documents WHERE export_state='held'").all();
  for(let offset=0;offset<rows.length;offset+=50){
   const batch=rows.slice(offset,offset+50).map(r=>{const row=db.prepare('SELECT * FROM forum_documents WHERE site=? AND role=? AND native_id=?').get(r.site,r.role,r.native_id),binding=db.prepare('SELECT * FROM forum_es_bindings WHERE site=? AND role=? AND native_id=?').get(row.site,row.role,row.role==='forumTopic'?row.thread_id:row.native_id);return {row,binding};});
   const response=await es.mget({body:{docs:batch.map(i=>({_index:i.binding.es_index,_type:i.row.role,_id:i.binding.es_id}))}});if(response.docs?.length!==batch.length)throw Error('QC_ES_READ_INCOMPLETE');
   for(const [n,item] of batch.entries()){
    const {row}=item,h=response.docs[n],doc=JSON.parse(row.doc),proof=JSON.parse(row.proof),site=sites.get(row.site);result.checked++;
    try{if(!h.found||!site.allowedHosts.includes(h._source.siteName)||forumIdentity(h._source.url,row.role,site)!==forumIdentity(doc._source.url,row.role,site))throw Error('QC_ES_NATIVE_IDENTITY_MISMATCH');
     if(row.role==='forumComment'){const parent=db.prepare("SELECT * FROM forum_es_bindings WHERE site=? AND role='forumTopic' AND native_id=?").get(row.site,row.thread_id);doc._source.parentId=parent.es_id;doc._source.parentDate=parent.published;}
     ForumEs5Sink.prototype.verifyExisting.call({sites},h,doc,proof);
    }catch(e){result.errors.push({site:row.site,role:row.role,id:row.native_id,reason:e.code||e.message});}
   }
  }
  const parents=JSON.parse(fs.readFileSync(root+'/parent-manifest.json'));
  for(const row of parents){const h=await es.get({index:row.index,type:'forumTopic',id:row.id});result.parentsChecked++;if(h._version===row.version&&hash(h._source)===row.sourceHash)result.parentsUnchanged++;else result.errors.push({id:row.id,reason:'PARENT_CHANGED_AFTER_AUDIT'});}
  db.close();prior.close();
 }
 fs.writeFileSync(root+'/es-readback.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{es.close();}
