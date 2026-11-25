export function isForumSqliteContention(error){
 return error?.errcode===5||error?.errcode===6||['SQLITE_BUSY','SQLITE_LOCKED'].includes(error?.code);
}
// A failed local commit may follow a successful ES create. Repeat the normal
// lookup/confirmation path under the same live lease; never replay an ES bulk.
export async function flushForumWriterWithContention(flush,{canRetry,onRetry=()=>{},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 let retries=0;
 while(true){
  try{return await flush();}
  catch(error){
   if(!isForumSqliteContention(error)||!canRetry?.())throw error;
   onRetry({retries:++retries,sqliteCode:error.errcode??error.code});
   await sleep(250);
   if(!canRetry())throw error;
  }
 }
}
