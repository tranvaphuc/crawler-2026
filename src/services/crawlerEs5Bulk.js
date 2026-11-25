// Only the validated write callback in commitCrawlDocument submits documents.
// Each caller keeps its Bull ticket active until its own ES item is confirmed.
export function createEs5BulkWriter({es,maxItems=80,maxBytes=5*1024*1024,flushMs=10,maxConcurrent=2,checkExisting=false,existingReadTimeoutMs=1500,retryLimit=3,retryDelayMs=250,wait=ms=>new Promise(r=>setTimeout(r,ms)),onBatch=()=>{}}){
 let pending=[],bytes=0,timer=null,inFlight=0;
 const failure=(code,extra={})=>Object.assign(new Error(code),{code,...extra});
 function flush(){
  if(timer){clearTimeout(timer);timer=null;}
  // Keep waiting rows together while both HTTP slots are occupied. Splitting
  // them on every timer tick would recreate the old stream of tiny requests.
  while(pending.length&&inFlight<maxConcurrent){
   let count=0,batchBytes=0;
   while(count<pending.length&&count<maxItems&&batchBytes+pending[count].size<=maxBytes){batchBytes+=pending[count++].size;}
   const batch=pending.splice(0,count);bytes-=batchBytes;inFlight++;
   void send(batch,batchBytes).finally(()=>{inFlight--;if(pending.length)flush();});
  }
 }
 async function send(batch,batchBytes){
  const started=Date.now();let failed=0,created=0,duplicates=0,retries=0,remaining=batch,readExisting=0,readFallback=0;
  if(checkExisting&&typeof es.mget==='function'){
   try{
    const response=await es.mget({realtime:true,requestTimeout:existingReadTimeoutMs,body:{docs:batch.map(({doc})=>({_index:doc._index,_type:doc._type,_id:doc._id,_source:false}))}});
    if(response?.error||!Array.isArray(response?.docs)||response.docs.length!==batch.length)throw failure('ES5_PRESENCE_RESPONSE_INVALID');
    remaining=[];
    for(const [i,row]of batch.entries()){const value=response.docs[i],doc=row.doc;
     if(value?.found===true&&!value.error&&(value.status===undefined||value.status===200)&&value._index===doc._index&&value._type===doc._type&&value._id===doc._id&&Number.isSafeInteger(value._version)&&value._version>0){
      duplicates++;readExisting++;row.resolve({_index:value._index,_type:value._type,_id:value._id,_version:value._version,found:true,skipped:true,reason:'ES5_DOCUMENT_EXISTS',evidence:'realtime_mget'});
     }else remaining.push(row);
    }
   }catch{readFallback++;remaining=batch;}
  }
  while(remaining.length){
   let again=[];
   try{
   const response=await es.bulk({body:remaining.flatMap(row=>row.lines),refresh:false});
   if(!Array.isArray(response?.items)||response.items.length!==remaining.length)throw failure('ES5_BULK_RESPONSE_INVALID');
   for(const [i,row]of remaining.entries()){
    const result=response.items[i]?.create,doc=row.doc;
    if(!result||result._index!==doc._index||result._type!==doc._type||result._id!==doc._id){failed++;row.reject(failure('ES5_BULK_ITEM_IDENTITY_MISMATCH'));continue;}
    if(result.status===409&&result.error?.type==='version_conflict_engine_exception'){
     duplicates++;row.resolve({...result,skipped:true,reason:'ES5_DOCUMENT_EXISTS'});continue;
    }
    if(result.error||![200,201].includes(result.status)){
     if([429,502,503,504].includes(result.status)&&retries<retryLimit){again.push(row);continue;}
     failed++;row.reject(failure('ES5_BULK_ITEM_FAILED',{statusCode:result.status,esError:result.error}));continue;
    }
    if(result.status!==201||result.result!=='created'||!Number.isSafeInteger(result._version)||result._version<1){failed++;row.reject(failure('ES5_IMPORT_UNCONFIRMED'));continue;}
    created++;row.resolve(result);
   }
   }catch(error){
    const transient=[429,502,503,504].includes(error.status||error.statusCode)||['EPIPE','ECONNRESET','ETIMEDOUT','ECONNREFUSED','NoConnections','RequestTimeout'].includes(error.code||error.name);
    if(transient&&retries<retryLimit)again=remaining;
    else{failed+=remaining.length;for(const row of remaining)row.reject(error);}
   }
   if(!again.length)break;
   retries++;await wait(retryDelayMs*2**(retries-1));remaining=again;
  }
  // Telemetry must never turn a confirmed write into a failed job.
  try{onBatch({items:batch.length,bytes:batchBytes,created,duplicates,failed,retries,readExisting,readFallback,durationMs:Date.now()-started,inFlight});}catch{}
 }
 return{
  write(doc){
   let lines,size;
   try{
    lines=[JSON.stringify({create:{_index:doc._index,_type:doc._type,_id:doc._id}}),JSON.stringify(doc._source)];
    size=lines.reduce((n,line)=>n+Buffer.byteLength(line)+1,0);
   }catch(error){return Promise.reject(error);}
   if(size>maxBytes)return Promise.reject(failure('ES5_BULK_DOCUMENT_TOO_LARGE'));
   if(pending.length&&bytes+size>maxBytes)void flush();
   const result=new Promise((resolve,reject)=>pending.push({doc,lines,size,resolve,reject}));bytes+=size;
   if(pending.length>=maxItems)void flush();
   else if(!timer)timer=setTimeout(()=>void flush(),flushMs);
   return result;
  },
  flush
 };
}
