import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {forumTime} from '../src/forumFlow/time.mjs';
import {weeklyIndex} from '../src/web/newsParser.mjs';
import {forumIdentity} from '../src/forumFlow/es5.mjs';
import {ForumBoundedEsConnection} from '../src/forumFlow/boundedEsConnection.mjs';

const directory='/var/lib/forum-flow/writer-repair-20261119',suffixes=['',...(await fs.readdir(directory,{withFileTypes:true})).filter(d=>d.isDirectory()&&/^round\d+$/.test(d.name)).map(d=>'/'+d.name)],applications=await Promise.all(suffixes.map(async suffix=>JSON.parse(await fs.readFile(directory+suffix+'/original-apply.json'))));
if(applications.some(a=>!a.finishedAt))throw Error('PARENT_APPLICATION_NOT_COMPLETE');
const parentMap=new Map(applications.flatMap(a=>a.parents).map(p=>[p.site+'|'+p.threadId,p]));
if(applications.flatMap(a=>a.held).some(p=>!parentMap.has(p.site+'|'+p.threadId)))throw Error('PARENT_APPLICATION_UNRESOLVED');
const application={parents:[...parentMap.values()]};
const db=new DatabaseSync('/var/lib/forum-flow/runtime/state.sqlite',{readOnly:true}),env=dotenv.parse(await fs.readFile('/etc/forum-flow/forum.env')),sites=new Map(JSON.parse(await fs.readFile('config/forum-flow/sites.json')).map(s=>[s.domain,s]));
const es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',connectionClass:ForumBoundedEsConnection,log:[],maxRetries:0,requestTimeout:60000});
const result={at:new Date().toISOString(),rawChecked:0,esChecked:0,parentsChecked:0,historicalRootsChecked:0,states:{},errors:[]},hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const save=async()=>fs.writeFile(directory+'/verification.json',JSON.stringify(result,null,2));
try{
 await save();db.exec('BEGIN');
 for(const parent of application.parents){
  const site=sites.get(parent.site),binding=db.prepare("SELECT * FROM forum_es_bindings WHERE site=? AND role='forumTopic' AND native_id=?").get(parent.site,parent.threadId),root=await es.get({index:binding.es_index,type:'forumTopic',id:binding.es_id});
  if(root._source.publishedDate!==binding.published||forumIdentity(root._source.url,'forumTopic',site)!=='topic:'+parent.threadId)throw Error('PARENT_BINDING_MISMATCH');
  const unit=parent.precision==='minute'?60000:1000;
  if(Math.floor(Date.parse(root._source.publishedDate)/unit)!==Math.floor(Date.parse(parent.forumPublished)/unit))throw Error('PARENT_CLOCK_MISMATCH');
  result.parentsChecked++;
  for(const old of parent.conflictingHistoricalRoots||[]){const h=await es.get({index:old.index,type:'forumTopic',id:old.id});if(h._version!==old.version||hash(h._source)!==old.sourceHash)throw Error('HISTORICAL_PARENT_CHANGED');result.historicalRootsChecked++;}
  const rows=db.prepare("SELECT * FROM forum_documents WHERE site=? AND thread_id=? AND role='forumComment'").all(parent.site,parent.threadId);
  const exported=[];
  for(const row of rows){
   result.states[row.export_state]=(result.states[row.export_state]||0)+1;
   try{
    const doc=JSON.parse(row.doc),proof=JSON.parse(row.proof),time=forumTime(proof.time.raw,{kind:proof.time.kind,source:proof.time.source}),rawParent=db.prepare("SELECT doc FROM forum_documents WHERE site=? AND thread_id=? AND role='forumTopic'").get(row.site,row.thread_id),original=JSON.parse(rawParent.doc);
    if(time.publishedDate!==doc._source.publishedDate||doc._index!==weeklyIndex(time.publishedDate)||doc._source.parentId!==original._id||doc._source.parentDate!==original._source.publishedDate)throw Error('RAW_CLOCK_OR_PARENT_MISMATCH');
    result.rawChecked++;
    if(['created','existing'].includes(row.export_state)){
     const b=db.prepare('SELECT * FROM forum_es_bindings WHERE site=? AND role=? AND native_id=?').get(row.site,row.role,row.native_id);if(!b)throw Error('MISSING_EXPORT_BINDING');
     exported.push({row,doc,proof,b});
    }
   }catch(e){result.errors.push({site:row.site,id:row.native_id,phase:'raw',reason:e.message});}
  }
  for(let offset=0;offset<exported.length;offset+=100){
   const batch=exported.slice(offset,offset+100),response=await es.mget({body:{docs:batch.map(i=>({_index:i.b.es_index,_type:i.row.role,_id:i.b.es_id,_source:['url','siteName','publishedDate','parentId','parentDate']}))}});
   for(let n=0;n<batch.length;n++){
    const {row,doc,proof}=batch[n],hit=response.docs[n];
    try{
     if(!hit?.found||forumIdentity(hit._source.url,'forumComment',site)!==forumIdentity(doc._source.url,'forumComment',site)||!site.allowedHosts.includes(hit._source.siteName))throw Error('ES_IDENTITY_MISMATCH');
     let precision=proof.time.precision==='minute'?60000:1000;
     if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='forum_comment_reconciliations'").get()){
      const receipt=db.prepare('SELECT * FROM forum_comment_reconciliations WHERE site=? AND native_id=?').get(row.site,row.native_id);
      if(receipt&&receipt.es_id===hit._id&&receipt.es_index===hit._index&&receipt.forum_published===doc._source.publishedDate&&receipt.es_published===hit._source.publishedDate&&receipt.precision==='minute')precision=60000;
     }
     if(Math.floor(Date.parse(hit._source.publishedDate)/precision)!==Math.floor(Date.parse(doc._source.publishedDate)/precision))throw Error('ES_CLOCK_MISMATCH');
     if(hit._source.parentId!==binding.es_id||Date.parse(hit._source.parentDate)!==Date.parse(binding.published))throw Error('ES_PARENT_MISMATCH');
     result.esChecked++;
    }catch(e){result.errors.push({site:row.site,id:row.native_id,phase:'es',reason:e.message});}
   }
   await save();
  }
 }
 db.exec('COMMIT');result.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify(result));if(result.errors.length)process.exitCode=1;
}catch(e){console.log(JSON.stringify({error:/^[A-Z_]+$/.test(e.message)?e.message:e.code||'VERIFY_FAILED'}));process.exitCode=1;}
finally{db.close();es.close();}
