import {setTimeout as wait} from 'node:timers/promises';

export function isNewsSqliteContention(error){
 return error?.code==='ERR_SQLITE_ERROR'&&Number.isInteger(error.errcode)&&[5,6].includes(error.errcode&255);
}

// For resumable SQLite-only operations. Never pass an HTTP request, AI call,
// or ES bulk here: a retry must not repeat an external side effect.
export async function waitForNewsSqlite(operation,{guard=()=>{},onWait=()=>{},maxWaitMs=60000,delayMs=100,sleep=wait,now=Date.now}={}){
 const started=now();let retries=0;
 while(true){
  guard();
  try{return await operation();}
  catch(error){
   if(!isNewsSqliteContention(error)||now()-started>=maxWaitMs)throw error;
   guard();onWait({sqliteCode:error.errcode,retries:++retries,waitedMs:now()-started});
   await sleep(delayMs);guard();
  }
 }
}

// Only retry BEGIN IMMEDIATE before the callback has run. In particular, never
// replay callbacks after a failed COMMIT or after they emitted result events.
export async function newsSqliteTransaction(state,callback,{operation='local_write',...options}={}){
 if(callback.constructor.name==='AsyncFunction')throw Error('NEWS_SQLITE_ASYNC_TRANSACTION');
 return waitForNewsSqlite(()=>{
  let entered=false;
  try{return state.tx(()=>{entered=true;options.guard?.();const result=callback();if(result&&typeof result.then==='function')throw Error('NEWS_SQLITE_ASYNC_TRANSACTION');return result;},operation);}
  catch(error){
   if(entered||state.db?.isTransaction===true){
    if(isNewsSqliteContention(error))throw Object.assign(Error('NEWS_SQLITE_TRANSACTION_NOT_REPLAYABLE'),{cause:error});
   }
   throw error;
  }
 },options);
}
