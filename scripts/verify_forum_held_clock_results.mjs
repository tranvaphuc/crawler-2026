import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {ForumBoundedEsConnection} from '../src/forumFlow/boundedEsConnection.mjs';
import {forumIdentity} from '../src/forumFlow/es5.mjs';

const dir='/var/lib/forum-flow/writer-repair-20261119/held-clock-audit-v2';
const {requeued,historical,skipped}=JSON.parse(await fs.readFile(dir+'/requeue.json'));
const db=new DatabaseSync('/var/lib/forum-flow/runtime/state.sqlite',{readOnly:true});
const sites=new Map(JSON.parse(await fs.readFile('config/forum-flow/sites.json')).map(site=>[site.domain,site]));
const env=dotenv.parse(await fs.readFile('/etc/forum-flow/forum.env'));
const es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',connectionClass:ForumBoundedEsConnection,log:[],maxRetries:0,requestTimeout:45000});
const row=db.prepare('SELECT * FROM forum_documents WHERE site=? AND role=? AND native_id=?');
const binding=db.prepare('SELECT * FROM forum_es_bindings WHERE site=? AND role=? AND native_id=?');
const results=[], checks=[];
try{
 for(const key of requeued){
  const record=row.get(...key), doc=JSON.parse(record.doc);
  const [site,type,id]=key, bound=binding.get(site,type,type==='forumTopic'?record.thread_id:id);
  const entry={key,state:record.export_state,reason:record.export_reason};results.push(entry);
  if(!['existing','created'].includes(entry.state))continue;
  if(!bound){entry.error='BINDING_MISSING';continue;}
  const parent=type==='forumComment'?binding.get(site,'forumTopic',record.thread_id):null;
  checks.push({entry,index:bound.es_index,type,id:bound.es_id,doc,parent});
 }
 for(const item of historical){
  const record=row.get(...item.key), entry={key:item.key,state:record.export_state,reason:record.export_reason};results.push(entry);
  checks.push({entry,index:item.es.index,type:'forumComment',id:item.es.id,historical:item.es});
 }
 if(checks.length){
  const response=await es.mget({body:{docs:checks.map(c=>({_index:c.index,_type:c.type,_id:c.id,...(c.historical?{}:{_source:['url','siteName','publishedDate','parentId','parentDate','title']})}))}});
  for(const [n,check] of checks.entries()){
   const hit=response.docs[n], {entry,doc,parent}=check;
   if(!hit?.found){entry.error='ES_RECORD_MISSING';continue;}
   if(check.historical){
    const hash=createHash('sha256').update(JSON.stringify(hit._source)).digest('hex');
    if(entry.state!=='outside_window'||hash!==check.historical.hash||hit._version!==check.historical.version)entry.error='HISTORICAL_RECORD_CHANGED';
   }else{
    const site=sites.get(entry.key[0]), identity=forumIdentity(doc._source.url,check.type,site);
    if(!identity||identity!==forumIdentity(hit._source.url,check.type,site)||Date.parse(doc._source.publishedDate)!==Date.parse(hit._source.publishedDate)||!site.allowedHosts.includes(hit._source.siteName))entry.error='ES_IDENTITY_OR_CLOCK_MISMATCH';
    if(check.type==='forumComment'&&(!parent||parent.es_id!==hit._source.parentId||Date.parse(parent.published)!==Date.parse(hit._source.parentDate)))entry.error='ES_PARENT_MISMATCH';
   }
   entry.verified=!entry.error;
   entry.es={index:hit._index,id:hit._id,published:hit._source.publishedDate};
  }
 }
 console.log(JSON.stringify({at:new Date().toISOString(),results,skipped,counts:db.prepare("SELECT site,role,export_state,export_reason,COUNT(*) n FROM forum_documents WHERE export_state IN ('held','pending','outside_window') GROUP BY site,role,export_state,export_reason").all()}));
} finally {db.close();es.close();}
