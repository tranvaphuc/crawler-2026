// Backpressure only empty assignment attempts. Parking their active slots avoids
// cycling a large cold backlog while healthy reads and worker intake continue.
// Never pause/resume the Bull worker: its active loop may outlive a short wait.
export function createProxyIntakeBackoff({worker,shouldStop=()=>false,now=Date.now,threshold=8,windowMs=1000,pauseMs=3000,setTimer=setTimeout,clearTimer=clearTimeout,onEvent=()=>{}}){
 const misses=new Map(),waiters=new Set();let closed=false,until=0,pauses=0;
 const stopped=()=>closed||shouldStop()||worker.closing;
 const park=()=>new Promise(resolve=>{
  let timer;const waiter={finish(value){if(!waiters.delete(waiter))return;if(timer)clearTimer(timer);resolve(value);}};
  waiters.add(waiter);timer=setTimer(()=>waiter.finish(!stopped()),Math.max(0,until-now()));timer?.unref?.();
 });
 return{
  async observe({jobId,assignmentUnavailable=false}){
   if(stopped()||!assignmentUnavailable||!jobId)return false;
   const at=now();
   if(until>at)return park();
   for(const [id,t]of misses)if(at-t>windowMs)misses.delete(id);misses.set(jobId,at);
   if(misses.size<threshold)return false;
   misses.clear();until=at+pauseMs;pauses++;
   try{onEvent('proxy_intake_backoff',{pauseMs,distinctMisses:threshold});}catch{}
   return park();
  },
  status(){return{held:!closed&&until>now(),pauses};},
  close(){closed=true;until=0;misses.clear();for(const waiter of [...waiters])waiter.finish(false);}
 };
}
