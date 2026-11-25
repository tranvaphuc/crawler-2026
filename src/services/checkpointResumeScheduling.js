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
function isFirstPage(data,cache){
 if(data?.kind!=='source'||hasContinuation(data,cache))return false;
 if(!data.checkpoint)return true;
 const key='first:'+data.checkpoint;if(cache.has(key))return cache.get(key);
 let first=false;try{const state=unpackState(data.checkpoint);first=!!state&&typeof state==='object'&&!state.nativeCursor&&!state.seen?.size&&!state.seenIds?.size&&!state.sourceEmittedIds?.size&&!state.items?.length;}catch{}
 if(data.checkpoint.length<=4096&&cache.size<64)cache.set(key,first);
 return first;
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
for i=8,#ARGV do proven[ARGV[i]]=true end
local fifoBurst=tonumber(ARGV[5])
local firstBurst=tonumber(ARGV[6])
local firstCandidates=cjson.decode(ARGV[7])
local firstPages={}
local sources={}
local function sourceKey(data)
 local id=type(data.source)=='table' and data.source._id or nil
 if type(id)=='string' or type(id)=='number' then return tostring(id) end
 return nil
end
if firstBurst>0 then
 for _,id in ipairs(redis.call('LRANGE',KEYS[5],0,-1)) do
  local ok,data=pcall(cjson.decode,redis.call('HGET',ARGV[1]..id,'data') or '')
  if ok and type(data)=='table' then local key=sourceKey(data);if key then sources[key]=true end end
 end
end
local function availableSource(data)
 if firstBurst==0 then return true end
 local key=sourceKey(data)
 return not key or not sources[key]
end
local function selectSource(data)
 if firstBurst>0 then local key=sourceKey(data);if key then sources[key]=true end end
end
local function offer(id)
 -- Old workers and existing registrations may still publish empty initial
 -- checkpoints. Validate only bounded candidates, leaving their FIFO tickets
 -- and payloads untouched. A fresh cursor with page>0 needs no refresh wait.
 local data
 if not proven[id] or firstBurst>0 then
  local ok;ok,data=pcall(cjson.decode,redis.call('HGET',ARGV[1]..id,'data') or '')
  local cursor=ok and type(data)=='table' and
   (tonumber(data.page or 0) and tonumber(data.page or 0)>0 or
    tonumber(data.groupCursorProxyBudgetStartedAt or 0) and tonumber(data.groupCursorProxyBudgetStartedAt or 0)>0 or
    tonumber(data.groupCursorProxyWaitStartedAt or 0) and tonumber(data.groupCursorProxyWaitStartedAt or 0)>0)
  if not cursor and not proven[id] then
   redis.call('ZREM',KEYS[4],id);redis.call('ZREM',KEYS[7],id)
   return false
  end
  if not ok or type(data)~='table' or not availableSource(data) then return false end
 end
 if not selected[id] and redis.call('EXISTS',ARGV[1]..id)==1 and
  tonumber(redis.call('HGET',ARGV[1]..id,'priority') or '0')==0 and redis.call('LPOS',wait,id) then
  resumes[#resumes+1]=id;selected[id]=true;if data then selectSource(data) end
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
for i=8,#ARGV do
 if #resumes>=burst*batches then break end
 offer(ARGV[i])
end
for _,id in ipairs(firstCandidates) do
 if #firstPages>=firstBurst*batches then break end
 if not selected[id] and redis.call('LPOS',wait,id) and tonumber(redis.call('HGET',ARGV[1]..id,'priority') or '0')==0 then
  local ok,data=pcall(cjson.decode,redis.call('HGET',ARGV[1]..id,'data') or '')
  if ok and type(data)=='table' and data.kind=='source' and (tonumber(data.page) or 0)==0 and availableSource(data) and
   math.max(tonumber(data.proxyWaitUntil) or 0,tonumber(data.sourceYieldUntil) or 0,tonumber(data.originWaitUntil) or 0)<=tonumber(ARGV[4]) then
   firstPages[#firstPages+1]=id;selected[id]=true;selectSource(data)
  end
 end
end
if #resumes==0 and #firstPages==0 then return {{},{},'no_ready_checkpoint',{}} end
local fifo={}
-- At most burst*batches exclusions: this window always contains enough of the
-- oldest remaining FIFO tickets, without scanning the full list or job payloads.
local head=redis.call('LRANGE',wait,-(burst+firstBurst+fifoBurst)*batches,-1)
for i=#head,1,-1 do
 if #fifo>=fifoBurst*batches then break end
 if not selected[head[i]] then
  local allowed=true;local data
  if firstBurst>0 then local ok;ok,data=pcall(cjson.decode,redis.call('HGET',ARGV[1]..head[i],'data') or '');allowed=ok and type(data)=='table' and availableSource(data) and math.max(tonumber(data.proxyWaitUntil) or 0,tonumber(data.sourceYieldUntil) or 0,tonumber(data.originWaitUntil) or 0)<=tonumber(ARGV[4]) end
  if allowed then fifo[#fifo+1]=head[i];selected[head[i]]=true;if data then selectSource(data) end end
 end
end
local order={}
local r=1;local f=1;local j=1
for batch=1,batches do
 for n=1,burst do if resumes[r] then order[#order+1]=resumes[r];r=r+1 end end
 for n=1,firstBurst do if firstPages[f] then order[#order+1]=firstPages[f];f=f+1 end end
 for n=1,fifoBurst do if fifo[j] then order[#order+1]=fifo[j];j=j+1 end end
end
for _,id in ipairs(order) do redis.call('LREM',wait,1,id) end
for i=#order,1,-1 do redis.call('RPUSH',wait,order[i]) end
redis.call('RPUSH',KEYS[3],unpack(order))
redis.call('EXPIRE',KEYS[3],300)
return {resumes,fifo,'scheduled',firstPages}
`;

export function createCheckpointResumeScheduler({redis,jobs,queue=CHECKPOINT_RESUME_QUEUE,now=Date.now,log=()=>{},pollMs=250,refreshMs=5000,resumeBurst=CHECKPOINT_RESUME_BURST,fifoBurst=1,firstPageBurst=0}={}){
 for(const value of [resumeBurst,fifoBurst])if(!Number.isInteger(value)||value<1||value>8)throw Error('CHECKPOINT_SCHEDULING_INVALID');
 if(!Number.isInteger(firstPageBurst)||firstPageBurst<0||firstPageBurst>8)throw Error('CHECKPOINT_SCHEDULING_INVALID');
 const prefix='bull:crawler-flow-'+queue+':';let lastPoll=-Infinity,lastRefresh=-Infinity,candidates=[],firstCandidates=[];
 return async function schedule(){
  const at=now();if(at-lastPoll<pollMs)return;lastPoll=at;
  if(at-lastRefresh>=refreshMs){
   const filter=firstPageBurst?{queue,state:'queued'}:{queue,state:'queued','data.checkpoint':{$type:'string',$ne:''},$or:[{proxyDeferred:true},{sourceDeferred:true},{originDeferred:true},{'data.proxyWaitReason':'PROXY_ENDPOINTS_UNAVAILABLE'},{'data.sourceSlices':{$gt:0}}]};
   const proven={$or:['page','groupCursorProxyBudgetStartedAt','groupCursorProxyWaitStartedAt'].map(key=>({$gt:[{$ifNull:['$data.'+key,0]},0]}))};
   const rows=await jobs.find(filter,
    {projection:{_id:1,createdAt:1,'data.kind':1,'data.source._id':1,'data.page':1,'data.checkpoint':{$cond:[proven,'$$REMOVE','$data.checkpoint']},'data.proxyWaitUntil':1,'data.sourceYieldUntil':1,'data.originWaitUntil':1,'data.groupCursorProxyBudgetStartedAt':1,'data.groupCursorProxyWaitStartedAt':1,'data.groupCursorProxyWaitMs':1}}).maxTimeMS(2000).toArray();
   const cache=new Map(),classified=rows.map(row=>({row,continuation:hasContinuation(row.data,cache)})),continuations=classified.filter(x=>x.continuation).map(x=>x.row);
   const deadlines=continuations.map(row=>[groupCursorProxyWaitDeadline(row.data),row._id]).filter(([deadline])=>deadline);
   if(deadlines.length)await redis.zadd(prefix+'checkpoint-resume-expiring',...deadlines.flat());
   const ready=rows=>rows.map(row=>({id:row._id,ready:Math.max(row.data?.proxyWaitUntil||0,row.data?.sourceYieldUntil||0,row.data?.originWaitUntil||0)||+new Date(row.createdAt)})).filter(row=>row.ready<=at).sort((a,b)=>a.ready-b.ready||a.id.localeCompare(b.id)).map(row=>row.id);
   candidates=ready(continuations);
   firstCandidates=firstPageBurst?ready(classified.filter(x=>!x.continuation&&isFirstPage(x.row.data,cache)).map(x=>x.row)):[];
   lastRefresh=at;
  }
  const [resumeIds,fifoIds,state,firstPageIds=[]]=await redis.eval(checkpointResumeBatchScript,7,prefix+'wait',prefix+'meta',prefix+'checkpoint-resume-batch',prefix+'checkpoint-resume-ready',prefix+'active',prefix+'delayed',prefix+'checkpoint-resume-expiring',prefix,resumeBurst,CHECKPOINT_RESUME_BATCHES,at,fifoBurst,firstPageBurst,JSON.stringify(firstCandidates.slice(0,128)),...candidates.slice(0,128));
  if(state==='scheduled'){
   const dispatched=new Set([...resumeIds,...fifoIds,...firstPageIds]);candidates=candidates.filter(id=>!dispatched.has(id));firstCandidates=firstCandidates.filter(id=>!dispatched.has(id));
   log('checkpoint_resume_scheduled',{queue,policy:firstPageBurst?'first-page-resume-fifo-v1':`checkpoint-resume-${resumeBurst}-to-${fifoBurst}-v2-due-lane`,resumeIds,fifoIds,...(firstPageBurst?{firstPageIds}:{})});
  }
  return {resumeIds,fifoIds,state,firstPageIds};
 };
}
// Run independently of coordinator outbox/retention I/O; never overlap polls.
export function startCheckpointResumeScheduler({shouldStop=()=>false,onError=()=>{},...options}={}){
 const schedule=createCheckpointResumeScheduler(options);let pending=null,closed=false,last=null;
 const tick=()=>{if(closed||pending||shouldStop())return;pending=Promise.resolve().then(schedule).then(result=>{if(result)last={at:new Date(),state:result.state,resumes:result.resumeIds.length,fifo:result.fifoIds.length,firstPages:result.firstPageIds?.length||0};}).catch(onError).finally(()=>{pending=null;});};
 const timer=setInterval(tick,options.pollMs||250);timer.unref?.();tick();
 return{status:()=>last,async close(){closed=true;clearInterval(timer);if(pending)await pending;}};
}
