// Read ES by exact identity, then repair only the reviewed held import queue.
import fs from 'node:fs';
import {createRequire} from 'node:module';
const base='/opt/news-flow/current',require=createRequire(base+'/package.json');
const {DatabaseSync}=await import('node:sqlite'),dotenv=require('dotenv'),ES=require('elasticsearch');
const {articleKey}=await import('file://'+base+'/src/newsFlow/identity.mjs');
const apply=process.argv.includes('--apply');
const env=dotenv.parse(fs.readFileSync('/etc/news-flow/news.env'));
const db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:!apply});
db.exec('PRAGMA busy_timeout=20000');
const es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',log:[],requestTimeout:30000,maxRetries:0});
const rows=db.prepare("SELECT * FROM outbox WHERE state='held' AND reason='ES5_CREATE_UNCONFIRMED'").all();
const decisions=[];
try{
 for(let i=0;i<rows.length;i+=50){
  const batch=rows.slice(i,i+50),docs=batch.map(r=>JSON.parse(r.doc));
  const response=await es.mget({body:{docs:docs.map(d=>({_index:d._index,_type:d._type,_id:d._id}))}});
  if(!Array.isArray(response.docs)||response.docs.length!==docs.length)throw Error('QC_ES_READ_INCOMPLETE');
  for(let n=0;n<batch.length;n++){
   const row=batch[n],doc=docs[n],hit=response.docs[n];
   let status='review';
   if(hit._index===doc._index&&hit._type===doc._type&&hit._id===doc._id&&!hit.error){
    if(hit.found===false)status='requeue';
    else if(hit.found===true&&articleKey(hit._source?.url)===articleKey(doc._source.url)&&Date.parse(hit._source.publishedDate)===Date.parse(doc._source.publishedDate))status='confirmed';
   }
   decisions.push({id:row.id,index:doc._index,esId:doc._id,url:doc._source.url,status,...(status==='review'?{found:hit.found,readError:hit.error?.type,expectedPublishedDate:doc._source.publishedDate,actualPublishedDate:hit._source?.publishedDate,actualUrl:hit._source?.url}:{})});
   if(!apply||status==='review')continue;
   db.exec('BEGIN IMMEDIATE');
   try{
    const current=db.prepare("SELECT doc FROM outbox WHERE id=? AND state='held' AND reason='ES5_CREATE_UNCONFIRMED'").get(row.id);
    if(current?.doc===row.doc){
     if(status==='requeue')db.prepare("UPDATE outbox SET state='pending',reason=NULL,next_at=0 WHERE id=?").run(row.id);
     else{
      db.prepare('INSERT OR IGNORE INTO import_receipts VALUES(?,?,?,?,?,?,?)').run(row.id,doc._id,doc._index,doc._type,'existing',doc._source.url,Date.now());
      db.prepare("DELETE FROM outbox WHERE id=? AND state='held' AND reason='ES5_CREATE_UNCONFIRMED'").run(row.id);
     }
    }
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
 }
 console.log(JSON.stringify({at:new Date().toISOString(),apply,checked:rows.length,counts:decisions.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{}),decisions},null,2));
}catch(e){console.log(JSON.stringify({error:e.code||'QC_RECONCILE_FAILED',status:e.statusCode}));process.exitCode=1;}
finally{es.close();db.close();}
