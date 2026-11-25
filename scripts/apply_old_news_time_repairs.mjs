import fs from 'node:fs/promises';import path from 'node:path';import {isDeepStrictEqual} from 'node:util';import {DatabaseSync} from 'node:sqlite';import dotenv from 'dotenv';import ES from 'elasticsearch';
import {validateHistoricalTimeMapping} from '../src/newsFlow/historicalTimeRepair.mjs';
const root=path.resolve(process.argv[2]||'outputs/news-time-repair-391-2026-11-16'),plan=JSON.parse(await fs.readFile(process.argv[3]||path.join(root,'old-revalidated/plan.json'),'utf8')),out=path.join(root,process.argv[4]||'old-corrections');await fs.mkdir(out,{recursive:true,mode:0o700});
const env=dotenv.parse(await fs.readFile('/etc/news-flow/news.env')),es=new ES.Client({apiVersion:'5.6',host:env.ES5_HOST,log:[],maxRetries:0,requestTimeout:15000}),db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite');db.exec('PRAGMA busy_timeout=30000');const aiBefore=db.prepare('SELECT * FROM ai_usage ORDER BY day').all(),results=[];
async function durable(file,data){const temp=file+'.tmp',h=await fs.open(temp,'w',0o600);try{await h.writeFile(JSON.stringify(data,null,2));await h.sync();}finally{await h.close();}await fs.rename(temp,file);}
try{for(const row of plan){const file=path.join(out,row.id+'.json'),done=await fs.readFile(file,'utf8').then(JSON.parse).catch(()=>null);if(done?.state==='corrected'){results.push(done);continue;}
 const record={id:row.id,url:row.reference.url,site:row.reference.domain,expectedDate:row.expectedDate,sourceProof:row.check,at:new Date().toISOString(),state:'pending'};
 try{
  if(!row.approved||!row.check?.proof?.ok||row.check.proof.publishedDate!==row.expectedDate||row.check.proof.url!==row.reference.url)throw Error('CORRECTION_PROOF_MISSING');
  const current=await es.get({index:row.current._index,type:'newsTopic',id:row.current._id});if(current._version!==row.current._version||!isDeepStrictEqual(current._source,row.current._source))throw Error('DOCUMENT_CHANGED_AFTER_PLAN');
  const inserted=Date.parse(current._source.insertedDate);
  if(!Number.isFinite(inserted)||Date.parse(row.expectedDate)>inserted+300000)throw Error('ORIGINAL_PUBLICATION_AFTER_FIRST_INSERTION_REQUIRES_REVIEW');
  const corrected={...current._source,publishedDate:row.expectedDate};record.before=current;record.targetIndex=row.targetIndex;await durable(file,record);
  if(row.targetIndex===current._index){await es.update({index:current._index,type:'newsTopic',id:current._id,version:current._version,refresh:true,body:{doc:{publishedDate:row.expectedDate}}});}
  else{
   if(!await es.indices.exists({index:row.targetIndex}))throw Error('TARGET_WEEK_INDEX_UNAVAILABLE');
   const mapping=(await es.indices.getMapping({index:row.targetIndex}))[row.targetIndex]?.mappings;
   const oldMapping=(await es.indices.getMapping({index:current._index}))[current._index]?.mappings;
   validateHistoricalTimeMapping(corrected,{...oldMapping?._default_?.properties,...oldMapping?.newsTopic?.properties},{...mapping?._default_?.properties,...mapping?.newsTopic?.properties});
   const target=await es.get({index:row.targetIndex,type:'newsTopic',id:current._id}).catch(e=>{if(e.status===404||e.statusCode===404)return null;throw e;});
   if(target&&!isDeepStrictEqual(target._source,corrected))throw Error('TARGET_DOCUMENT_CONFLICT');
   if(!target)await es.create({index:row.targetIndex,type:'newsTopic',id:current._id,refresh:true,body:corrected});
   const created=await es.get({index:row.targetIndex,type:'newsTopic',id:current._id});if(!isDeepStrictEqual(created._source,corrected))throw Error('TARGET_COPY_NOT_VERIFIED');
   record.state='target_copy_verified';await durable(file,record);
   await es.delete({index:current._index,type:'newsTopic',id:current._id,version:current._version,refresh:true});
   db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE identities SET es_index=? WHERE es_index=? AND es_id=?').run(row.targetIndex,current._index,current._id);db.prepare('UPDATE import_receipts SET es_index=? WHERE es_index=? AND es_id=? AND url=?').run(row.targetIndex,current._index,current._id,current._source.url);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  }
  const verified=await es.get({index:row.targetIndex,type:'newsTopic',id:current._id});if(!isDeepStrictEqual(verified._source,corrected))throw Error('CORRECTION_POST_WRITE_MISMATCH');record.state='corrected';record.after={index:verified._index,id:verified._id,version:verified._version,publishedDate:verified._source.publishedDate};
 }catch(e){record.state=record.state==='target_copy_verified'?'target_copy_verified_needs_reconciliation':'held';record.reason=e.code||e.status||e.message||e.name;}
 await durable(file,record);results.push(record);console.log(JSON.stringify({done:results.length,total:plan.length,state:record.state,site:record.site}));
 }
 const after=db.prepare('SELECT * FROM ai_usage ORDER BY day').all();if(aiBefore.some(b=>!after.some(a=>a.day===b.day&&a.calls>=b.calls&&a.usd+1e-9>=b.usd)))throw Error('AI_LEDGER_NOT_PRESERVED');
 const summary={at:new Date().toISOString(),planned:plan.length,corrected:results.filter(r=>r.state==='corrected').length,held:results.filter(r=>r.state!=='corrected').length,movedIndices:results.filter(r=>r.state==='corrected'&&r.before._index!==r.after.index).length,aiUsagePreserved:true,paidAiCalls:0,backups:out};await durable(path.join(out,'summary.json'),summary);console.log(JSON.stringify(summary));
}finally{db.close();es.close();}
