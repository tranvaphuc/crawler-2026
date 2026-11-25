import {FLOW_WORKER_ROLES,FLOW_ISOLATED_WORKER_ROLES} from './flowRuntimeTopology.js';
const recoverableServices=['crawler-queue-flow.service','crawler-proxy-manager.service',...[...new Set([...FLOW_WORKER_ROLES,...FLOW_ISOLATED_WORKER_ROLES])].map(role=>'crawler-queue-worker@'+role+'.service')];
export function serviceRecoveryDecision({service,state,backlog=0,stagnantMs=0,heartbeatAgeMs=0,recentNetworkEvents=0,unhealthySamples=0,maintenance=false,history=[],now=Date.now()}){
 if(maintenance||!recoverableServices.includes(service)||['activating','deactivating'].includes(state))return null;
 const recent=history.filter(t=>now-t<3600000);
 if(recent.length>=3||recent.some(t=>now-t<300000))return null;
 if(['failed','inactive'].includes(state))return{service,action:'start',reason:'SERVICE_NOT_RUNNING'};
 if(service==='crawler-proxy-manager.service'&&state==='active'&&unhealthySamples>=3)return{service,action:'restart',reason:'MANAGER_NOT_RESPONDING'};
 if(service!=='crawler-proxy-manager.service'&&state==='active'&&backlog>0&&stagnantMs>300000&&heartbeatAgeMs>180000&&!recentNetworkEvents)return{service,action:'restart',reason:'NO_HEARTBEAT_OR_PROGRESS'};
 return null;
}
export function sourceCapacity({eligible,uniqueFinished,uniqueVerified,verified2h=0,windowMinutes=15}){
 const rate=uniqueFinished/windowMinutes,verifiedRate=uniqueVerified/windowMinutes;
 const maximum=Math.floor(verifiedRate*120*.8),complete=verified2h>=eligible;
 return{requiredPerMinute:eligible/120,finishedPerMinute:rate,verifiedPerMinute:verifiedRate,projectedSweepMinutes:rate?eligible/rate:null,projectedVerifiedSweepMinutes:verifiedRate?eligible/verifiedRate:null,recommendedMaximumSources:maximum,recommendedAdditionalSources:complete?Math.max(0,maximum-eligible):0,verifiedCoverageComplete:complete,capacityBasis:'verified_success_receipts',capacityEstimateOnly:true};
}
export function sourceSlaIncident(coverage){
 const missing=count=>Math.max(0,coverage.eligible-(Number.isFinite(count)?count:0));
 const missingAttempted=missing(coverage.attempted2h),missingResponses=missing(coverage.response2h),missingVerified=missing(coverage.verified2h);
 if(!missingAttempted&&!missingResponses&&!missingVerified)return null;
 return{key:'SLA:'+coverage.queue,kind:'SOURCE_SLA_SHORTFALL',queue:coverage.queue,missingAttempted,missingResponses,missingVerified,projectedSweepMinutes:coverage.projectedSweepMinutes,projectedVerifiedSweepMinutes:coverage.projectedVerifiedSweepMinutes,requiredEvidence:'full_source_success_receipt',windowMs:7200000};
}
export function sourcePressureAdjustment({queues,desired,minimum={},load,cpus,freeRatio,diskFreeBytes,eventLoopP99Ms=0,eventLoopUtilization=0,pressureSamples=0,healthySamples=0}){
 const hostPressure=load>cpus*1.15||freeRatio<.12||diskFreeBytes<3*1024**3;
 const pressure=hostPressure||eventLoopP99Ms>500||eventLoopUtilization>.95&&eventLoopP99Ms>150;
 // A busy shared Node process can be dominated by comments. Reducing only
 // sources repeatedly cannot cure that bottleneck and must not starve scans.
 // Actual host pressure still permits emergency reduction below the baseline.
 // Never raise a lower origin-429 budget as a side effect of this floor.
 if(pressure&&pressureSamples>=2){const next=Object.fromEntries(Object.entries(queues).map(([k,v])=>[k,Math.max(hostPressure?1:Math.min(v,minimum[k]||1),Math.floor(v*.8))]));if(Object.entries(next).some(([k,v])=>v!==queues[k]))return{reason:'RESOURCE_PRESSURE',queues:next};}
 if(!pressure&&load<cpus*.7&&freeRatio>.25&&diskFreeBytes>5*1024**3&&eventLoopP99Ms<100&&eventLoopUtilization<.85&&healthySamples>=5){const next=Object.fromEntries(Object.entries(queues).map(([k,v])=>[k,Math.min(desired[k]||v,Math.max(v+1,Math.ceil(v*1.1)))]));if(Object.entries(next).some(([k,v])=>v!==queues[k]))return{reason:'RESOURCE_HEADROOM',queues:next};}
 return null;
}
export function sourceRolePressurePlan({queues,desired,minimum={},resources,groups,previous={},globalCap=400}){
 let next={...queues};const samples={},actions=[],r=resources;
 for(const group of groups){
  const loopMs=group.fresh?group.eventLoopP99Ms||0:0,loopUtil=group.fresh?group.eventLoopUtilization||0:0,old=previous[group.role]||{},pressure=r.load>r.cpus*1.15||r.freeRatio<.12||r.diskFreeBytes<3*1024**3||loopMs>500||loopUtil>.95&&loopMs>150;
  const sample={pressureSamples:pressure?(old.pressureSamples||0)+1:0,healthySamples:pressure||!group.fresh||group.rateLimited?0:(old.healthySamples||0)+1};samples[group.role]=sample;
  const owned=Object.fromEntries(group.queueNames.filter(k=>Object.hasOwn(next,k)).map(k=>[k,next[k]]));
  const adjustment=sourcePressureAdjustment({queues:owned,desired,minimum,...r,eventLoopP99Ms:loopMs,eventLoopUtilization:loopUtil,...sample});
  if(!adjustment)continue;const candidate={...next,...adjustment.queues};if(Object.values(candidate).reduce((n,v)=>n+v,0)>globalCap)continue;
  next=candidate;actions.push({...adjustment,role:group.role});sample.healthySamples=0;
 }
 return{queues:next,samples,actions};
}
