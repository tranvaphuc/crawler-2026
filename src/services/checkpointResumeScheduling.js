// Reorder only ready FIFO members. BullMQ still owns promotion, locks, active
// claims, retry accounting and every deadline. A whole batch must leave waiting
// before another is inserted, so a slow FIFO slot cannot be pushed back forever.
import {groupCursorProxyWaitDeadline,isGroupCursorRead} from './groupSourceProxyPolicy.js';
import {unpackState} from './crawlerQueueFlow.js';
export const CHECKPOINT_RESUME_QUEUE='facebook-group-source';
export const CHECKPOINT_RESUME_BURST=4;
export const CHECKPOINT_RESUME_BATCHES=4;
// Acquiring a proxy already creates an empty serialized Group state. A saved
// checkpoint alone therefore does not establish that the first page was read.
function hasContinuation(data,cache=new Map()){
 if(isGroupCursorRead('crawler-flow-'+CHECKPOINT_RESUME_QUEUE,data))return true;
 if(data?.groupCursorProxyBudgetStartedAt>0||data?.groupCursorProxyWaitStartedAt>0)return true;
 const checkpoint=data?.checkpoint;if(typeof checkpoint!=='string'||!checkpoint)return false;
 if(cache.has(checkpoint))return cache.get(checkpoint);
 let cursor=false;try{cursor=isGroupCursorRead('crawler-flow-'+CHECKPOINT_RESUME_QUEUE,data,unpackState(checkpoint));}catch{}
 // The common empty checkpoint is shared by thousands of initial waiters.
 // Memoize only small payloads during this refresh, never durable job contents.
 if(checkpoint.length<=4096&&cache.size<32)cache.set(checkpoint,cursor);
 return cursor;
}
// New delayed continuations join a due-time FIFO ahead of the older cold
// checkpoint backlog. Otherwise thousands of old checkpoints hide new resumes.
export async function registerCheckpointResume({job,readyAt}){
 if(job.queueName!=='crawler-flow-'+CHECKPOINT_RESUME_QUEUE||job.data?.kind!=='source'||typeof job.data.checkpoint!=='string'||!job.data.checkpoint)return;
 if(!hasContinuation(job.data))return;
 try{const redis=await job.queue.client;await redis.zadd(job.queue.toKey('checkpoint-resume-ready'),readyAt,job.id);const deadline=groupCursorProxyWaitDeadline(job.data);if(deadline)await redis.zadd(job.queue.toKey('checkpoint-resume-expiring'),deadline,job.id);else await redis.zrem(job.queue.toKey('checkpoint-resume-expiring'),job.id);}
 catch(error){await job.log(JSON.stringify({event:'checkpoint_resume_register_failed',code:error.code||error.name})).catch(()=>{});}
}
export const checkpointResumeBatchScript=`
local wait=KEYS[1]
if redis.call('HEXISTS',KEYS[2],'paused')==1 then return {{},{},'paused'} end
for _,id in ipairs(redis.call('LRANGE',KEYS[3],0,-1)) do
 if redis.call('LPOS',wait,id) then return {{},{},'pending_batch'} end
end
redis.call('DEL',KEYS[3])
local depth=redis.call('LLEN',wait)
if depth==0 then return {{},{},'empty'} end
local burst=tonumber(ARGV[2])
local batches=tonumber(ARGV[3])
local resumes={}
local selected={}
-- The refresh may also prove legacy native cursors whose page counter is absent.
local proven={}
for i=5,#ARGV do proven[ARGV[i]]=true end
local function offer(id)
 -- Old workers and existing registrations may still publish empty initial
 -- checkpoints. Validate only bounded candidates, leaving their FIFO tickets
 -- and payloads untouched. A fresh cursor with page>0 needs no refresh wait.
 if not proven[id] then
  local ok,data=pcall(cjson.decode,redis.call('HGET',ARGV[1]..id,'data') or '')
  local cursor=ok and type(data)=='table' and
   (tonumber(data.page or 0) and tonumber(data.page or 0)>0 or
    tonumber(data.groupCursorProxyBudgetStartedAt or 0) and tonumber(data.groupCursorProxyBudgetStartedAt or 0)>0 or
    tonumber(data.groupCursorProxyWaitStartedAt or 0) and tonumber(data.groupCursorProxyWaitStartedAt or 0)>0)
  if not cursor then
   redis.call('ZREM',KEYS[4],id);redis.call('ZREM',KEYS[7],id)
   return false
  end
 end
 if not selected[id] and redis.call('EXISTS',ARGV[1]..id)==1 and
  tonumber(redis.call('HGET',ARGV[1]..id,'priority') or '0')==0 and redis.call('LPOS',wait,id) then
  resumes[#resumes+1]=id;selected[id]=true
  redis.call('ZREM',KEYS[4],id)
  redis.call('ZREM',KEYS[7],id)
  return true
 end
 return false
end
-- An exhausted cursor budget must not wait behind thousands of cold retries.
-- Only already-ready FIFO tickets are eligible; never promote delayed work.
for _,id in ipairs(redis.call('ZRANGEBYSCORE',KEYS[7],'-inf',ARGV[4],'LIMIT',0,512)) do
 if not offer(id) and not redis.call('LPOS',KEYS[5],id) and not redis.call('ZSCORE',KEYS[6],id) then redis.call('ZREM',KEYS[7],id) end
 if #resumes>=burst*batches then break end
end
-- Registration never promotes a delayed ticket: only an existing ready wait
-- member can be selected. Keep active registrations across the short gap
-- between registering and the native moveToDelayed call.
for _,id in ipairs(redis.call('ZRANGEBYSCORE',KEYS[4],'-inf',ARGV[4],'LIMIT',0,512)) do
 if #resumes>=burst*batches then break end
 if not offer(id) and not redis.call('LPOS',KEYS[5],id) and not redis.call('ZSCORE',KEYS[6],id) then redis.call('ZREM',KEYS[4],id) end
 if #resumes>=burst*batches then break end
end
for i=5,#ARGV do
 if #resumes>=burst*batches then break end
 offer(ARGV[i])
end
if #resumes==0 then return {{},{},'no_ready_checkpoint'} end
local fifo={}
-- At most burst*batches exclusions: this window always contains enough of the
-- oldest remaining FIFO tickets, without scanning the full list or job payloads.
local head=redis.call('LRANGE',wait,-(burst+1)*batches,-1)
for i=#head,1,-1 do
 if not selected[head[i]] then fifo[#fifo+1]=head[i];selected[head[i]]=true;if #fifo>=batches then break end end
end
local order={}
local j=1
for i=1,#resumes do
 order[#order+1]=resumes[i]
 if i%burst==0 and fifo[j] then order[#order+1]=fifo[j];j=j+1 end
end
while fifo[j] do order[#order+1]=fifo[j];j=j+1 end
for _,id in ipairs(order) do redis.call('LREM',wait,1,id) end
for i=#order,1,-1 do redis.call('RPUSH',wait,order[i]) end
redis.call('RPUSH',KEYS[3],unpack(order))
redis.call('EXPIRE',KEYS[3],300)
return {resumes,fifo,'scheduled'}
`;

export function createCheckpointResumeScheduler({redis,jobs,queue=CHECKPOINT_RESUME_QUEUE,now=Date.now,log=()=>{},pollMs=250,refreshMs=5000}={}){
 const prefix='bull:crawler-flow-'+queue+':';let lastPoll=-Infinity,lastRefresh=-Infinity,candidates=[];
 return async function schedule(){
  const at=now();if(at-lastPoll<pollMs)return;lastPoll=at;
  if(at-lastRefresh>=refreshMs){
   const rows=await jobs.find({queue,state:'queued','data.checkpoint':{$type:'string',$ne:''},$or:[{proxyDeferred:true},{sourceDeferred:true},{originDeferred:true},{'data.proxyWaitReason':'PROXY_ENDPOINTS_UNAVAILABLE'},{'data.sourceSlices':{$gt:0}}]},
    {projection:{_id:1,createdAt:1,'data.page':1,'data.checkpoint':1,'data.proxyWaitUntil':1,'data.sourceYieldUntil':1,'data.originWaitUntil':1,'data.groupCursorProxyBudgetStartedAt':1,'data.groupCursorProxyWaitStartedAt':1,'data.groupCursorProxyWaitMs':1}}).maxTimeMS(2000).toArray();
   const cache=new Map(),continuations=rows.filter(row=>hasContinuation(row.data,cache));
   const deadlines=continuations.map(row=>[groupCursorProxyWaitDeadline(row.data),row._id]).filter(([deadline])=>deadline);
   if(deadlines.length)await redis.zadd(prefix+'checkpoint-resume-expiring',...deadlines.flat());
   candidates=continuations.map(row=>({id:row._id,ready:Math.max(row.data?.proxyWaitUntil||0,row.data?.sourceYieldUntil||0,row.data?.originWaitUntil||0)||+new Date(row.createdAt)}))
    .filter(row=>row.ready<=at).sort((a,b)=>a.ready-b.ready||a.id.localeCompare(b.id)).map(row=>row.id);
   lastRefresh=at;
  }
  const [resumeIds,fifoIds,state]=await redis.eval(checkpointResumeBatchScript,7,prefix+'wait',prefix+'meta',prefix+'checkpoint-resume-batch',prefix+'checkpoint-resume-ready',prefix+'active',prefix+'delayed',prefix+'checkpoint-resume-expiring',prefix,CHECKPOINT_RESUME_BURST,CHECKPOINT_RESUME_BATCHES,at,...candidates.slice(0,128));
  if(state==='scheduled'){
   const dispatched=new Set([...resumeIds,...fifoIds]);candidates=candidates.filter(id=>!dispatched.has(id));
   log('checkpoint_resume_scheduled',{queue,policy:'checkpoint-resume-4-to-1-v2-due-lane',resumeIds,fifoIds});
  }
  return {resumeIds,fifoIds,state};
 };
}
// Run independently of coordinator outbox/retention I/O; never overlap polls.
export function startCheckpointResumeScheduler({shouldStop=()=>false,onError=()=>{},...options}={}){
 const schedule=createCheckpointResumeScheduler(options);let pending=null,closed=false,last=null;
 const tick=()=>{if(closed||pending||shouldStop())return;pending=Promise.resolve().then(schedule).then(result=>{if(result)last={at:new Date(),state:result.state,resumes:result.resumeIds.length,fifo:result.fifoIds.length};}).catch(onError).finally(()=>{pending=null;});};
 const timer=setInterval(tick,options.pollMs||250);timer.unref?.();tick();
 return{status:()=>last,async close(){closed=true;clearInterval(timer);if(pending)await pending;}};
}
