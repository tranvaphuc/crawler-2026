import fs from 'node:fs/promises';import dotenv from 'dotenv';import ES from 'elasticsearch';import {DatabaseSync} from 'node:sqlite';
const env={...dotenv.parse(await fs.readFile('.env')),...process.env},db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true}),es=new ES.Client({apiVersion:'5.6',host:env.ES5_HOST,log:[],maxRetries:0,requestTimeout:30000});
let report;
try{
 const rows=db.prepare("SELECT doc FROM outbox WHERE state='created'").all(),docs=rows.map(r=>JSON.parse(r.doc));let confirmed=0,mismatches=0;
 if(docs.length){const result=await es.mget({body:{docs:docs.map(d=>({_index:d._index,_type:d._type,_id:d._id}))}});for(const [i,h]of result.docs.entries()){const expected=docs[i],matches=h.found&&h._id===expected._id&&h._index===expected._index&&h._type===expected._type&&Object.entries(expected._source).every(([k,v])=>JSON.stringify(v)===JSON.stringify(h._source?.[k]));if(matches)confirmed++;else mismatches++;}}
 report={checkedAt:new Date().toISOString(),created:docs.length,confirmedExactFields:confirmed,fieldMismatches:mismatches,outbox:db.prepare('SELECT state,count(*) AS count FROM outbox GROUP BY state').all(),wireRequests:db.prepare('SELECT count(*) AS count FROM requests').get().count,heldReasons:db.prepare("SELECT reason,count(*) AS count FROM tasks WHERE state='held' GROUP BY reason").all(),verified:docs.length>0&&confirmed===docs.length&&mismatches===0};
 if(!report.verified)process.exitCode=2;
}catch(e){report={verified:false,error:e.code||'CANARY_VERIFICATION_FAILED'};process.exitCode=1;}finally{db.close();es.close();}
await fs.writeFile('/var/lib/news-flow/canary-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
