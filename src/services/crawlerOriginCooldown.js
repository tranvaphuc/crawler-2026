import {ProxyWaitDelayedError} from './crawlerProxyWait.js';
import {registerCheckpointResume} from './checkpointResumeScheduling.js';
import {originWaitMs,validOriginScope,originCooldownEnabled} from './originRateLimit.js';
const scopeKey=scope=>{if(!validOriginScope(scope))throw Error('ORIGIN_SCOPE_INVALID');return 'crawler-flow-origin-cooldown:'+scope;};
const extendScript="local ttl=redis.call('pttl',KEYS[1]);if ttl<tonumber(ARGV[1]) then redis.call('psetex',KEYS[1],ARGV[1],'1') end;return redis.call('pttl',KEYS[1])";
export function createOriginCooldowns({redis,collection,now=Date.now}={}){
 const publish=async(scope,until)=>{const ttl=Math.max(1,Math.ceil(until-now()));await redis.eval(extendScript,1,scopeKey(scope),ttl);};
 return{
  async restore(){const rows=await collection.find({until:{$gt:new Date(now())}},{projection:{_id:1,until:1}}).toArray();for(const row of rows)if(originCooldownEnabled(row._id)&&+new Date(row.until)>now())await publish(row._id,+new Date(row.until));return rows.length;},
  async remaining(scope){scopeKey(scope);if(!originCooldownEnabled(scope))return 0;return Math.max(0,await redis.pttl(scopeKey(scope)));},
  async defer(scope,result){
   if(!originCooldownEnabled(scope))throw Error('FACEBOOK_RATE_LIMIT_REQUIRES_PROXY_ROTATION');
   const until=now()+originWaitMs(result.retryAfterMs),reason=/^[A-Z0-9_.:-]{1,100}$/.test(result.reason||'')?result.reason:'ORIGIN_RATE_LIMITED';
   // Publish first: a durable-store failure must not cause other processes to
   // continue immediately against the known origin limit.
   await publish(scope,until);
   await collection.updateOne({_id:scope},{$max:{until:new Date(until)},$set:{reason,lastSeenAt:new Date(now())}},{upsert:true});
   const saved=await collection.findOne({_id:scope},{projection:{until:1}}),effective=Math.max(until,+new Date(saved?.until||0));await publish(scope,effective);return effective;
  }
 };
}
export class FlowOriginWaitError extends Error{
 constructor(retryAfterMs,scope,reason='ORIGIN_RATE_LIMIT_WAIT'){super('ORIGIN_RATE_LIMIT_WAIT');scopeKey(scope);this.retryAfterMs=originWaitMs(retryAfterMs);this.scope=scope;this.originReason=reason;}
}
export async function delayOriginJob({job,token,jobs,error,now=Date.now()}){
 const until=Math.max(now+error.retryAfterMs,Number(job.data.originWaitUntil)||0);
 Object.assign(job.data,{originWaitUntil:until,originScope:error.scope,originWaits:(job.data.originWaits||0)+1});
 await jobs.updateOne({_id:job.id},{$set:{state:'queued',originDeferred:true,data:job.data}});
 await job.updateData(job.data);await registerCheckpointResume({job,readyAt:until});await job.moveToDelayed(Math.min(until,now+86400000),token);
 throw new ProxyWaitDelayedError();
}
