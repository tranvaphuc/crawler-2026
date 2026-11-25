// Resolve only this cohort's indeterminate create results. ES remains read-only;
// an independently absent identity may be offered once to the existing writer.
import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';import {isDeepStrictEqual} from 'node:util';
import {categoryImportDecision} from '../src/newsFlow/categoryImportReconciliation.mjs';
const root=process.env.NEWS_CATEGORY_AUDIT_ROOT||'/var/lib/news-flow/category-coverage-20261123',apply=process.argv.includes('--apply'),db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:!apply}),apps=new DatabaseSync(root+'/applications.sqlite'),require=createRequire('/opt/news-flow/current/package.json'),env=require('dotenv').parse(fs.readFileSync('/etc/news-flow/news.env')),ES=require('elasticsearch'),es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',log:[],maxRetries:0,requestTimeout:20000});
db.exec('PRAGMA busy_timeout=20000');apps.exec('PRAGMA busy_timeout=20000;CREATE TABLE IF NOT EXISTS import_reconciliations(id TEXT PRIMARY KEY,doc_sha TEXT,decision TEXT,checked_at INTEGER,evidence TEXT)');
const rows=db.prepare("SELECT DISTINCT o.* FROM news_category_backfill c JOIN outbox o ON o.id=c.es_id WHERE o.state='held' AND o.reason='ES5_CREATE_UNCONFIRMED'").all().filter(r=>{const prior=apps.prepare('SELECT decision,evidence FROM import_reconciliations WHERE id=?').get(r.id);return !prior||prior.decision==='held_for_document_review'&&JSON.parse(prior.evidence).policy!=='native-fields-v1';}),result={at:new Date().toISOString(),apply,checked:rows.length,decisions:[],esMutations:0};
try{
 const info=await es.info(),proof=JSON.parse(fs.readFileSync('/etc/news-flow/identity-proof.json')).summary;if(!proof.verified||!info.version.number.startsWith('5.6.')||createHash('sha256').update(info.cluster_uuid).digest('hex')!==proof.clusterFingerprint)throw Error('ES_IDENTITY_CHANGED');
 const docs=rows.map(r=>JSON.parse(r.doc)),hits=rows.length?(await es.mget({body:{docs:docs.map(d=>({_index:d._index,_type:d._type,_id:d._id}))}})).docs:[];if(hits.length!==rows.length)throw Error('ES_READ_INCOMPLETE');
 for(let i=0;i<rows.length;i++){
  const row=rows[i],doc=docs[i],hit=hits[i],decision=categoryImportDecision(doc,hit),evidence={policy:'native-fields-v1',index:doc._index,id:doc._id,found:hit.found,version:hit._version,differentFields:Object.keys(doc._source).filter(k=>!isDeepStrictEqual(hit._source?.[k],doc._source[k])),sourceHash:hit._source?createHash('sha256').update(JSON.stringify(hit._source)).digest('hex'):null};let changed=0;
  if(apply&&decision!=='held_for_document_review'){
   db.exec('BEGIN IMMEDIATE');try{const current=db.prepare("SELECT doc,config FROM outbox WHERE id=? AND state='held' AND reason='ES5_CREATE_UNCONFIRMED'").get(row.id);if(current?.doc===row.doc&&current.config===row.config){
    if(decision==='requeued_after_confirmed_absence')changed=db.prepare("UPDATE outbox SET state='pending',reason=NULL,next_at=0 WHERE id=? AND state='held' AND reason='ES5_CREATE_UNCONFIRMED'").run(row.id).changes;
    else{db.prepare('INSERT OR IGNORE INTO import_receipts VALUES(?,?,?,?,?,?,?)').run(row.id,doc._id,doc._index,doc._type,'existing',doc._source.url,Date.now());changed=db.prepare("DELETE FROM outbox WHERE id=? AND state='held' AND reason='ES5_CREATE_UNCONFIRMED'").run(row.id).changes;}
   }db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  }
  if(apply&&(changed||decision==='held_for_document_review'))apps.prepare('INSERT OR REPLACE INTO import_reconciliations VALUES(?,?,?,?,?)').run(row.id,createHash('sha256').update(row.doc).digest('hex'),decision,Date.now(),JSON.stringify(evidence));
  result.decisions.push({url:doc._source.url,decision,changed,...evidence});
 }
 result.counts=result.decisions.reduce((out,row)=>(out[row.decision]=(out[row.decision]||0)+1,out),{});if(apply)fs.writeFileSync(root+'/import-reconciliation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){console.log(JSON.stringify({apply,error:/^[A-Z0-9_]+$/.test(error.message||'')?error.message:'ES_RECONCILIATION_FAILED'}));process.exitCode=1;}finally{db.close();apps.close();es.close();}
