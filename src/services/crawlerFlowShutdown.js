// Stop intake at signal time, even while the coordinator awaits unrelated I/O.
export function createFlowShutdown({onError=()=>{},onState=()=>{}}={}){
 let stopped=false,workers=null,draining=null;
 const drain=()=>{
  if(!workers)return Promise.resolve();
  if(!draining)draining=Promise.allSettled(workers.map(worker=>Promise.resolve().then(async()=>{await worker.pause?.(true);onState('intake_paused',worker.name);await worker.close();onState('closed',worker.name);}))).then(results=>{for(const result of results)if(result.status==='rejected')onError(result.reason);return results;});
  return draining;
 };
 return{get stopped(){return stopped;},requestStop(){stopped=true;void drain();},setWorkers(value){if(workers)throw Error('SHUTDOWN_WORKERS_ALREADY_SET');workers=value;if(stopped)void drain();},drain};
}
