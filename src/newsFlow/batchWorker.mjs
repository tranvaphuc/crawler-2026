import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {selectNewsArticleBatch} from './articleBatch.mjs';
const db=new DatabaseSync(workerData.file,{readOnly:true});db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000;');
parentPort.on('message',({id,sites,limit})=>{
 const start=performance.now();let transaction=false;
 try{db.exec('BEGIN');transaction=true;const ids=selectNewsArticleBatch(db,sites,limit);db.exec('COMMIT');transaction=false;parentPort.postMessage({id,ids,elapsedMs:performance.now()-start});}
 catch(e){if(transaction)db.exec('ROLLBACK');parentPort.postMessage({id,error:'NEWS_BATCH_QUERY_FAILED'});}
});
