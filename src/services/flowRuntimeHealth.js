import {FLOW_WORKER_ROLES,FLOW_ISOLATED_WORKER_ROLES,flowWorkerRoles,flowSourceRoles,queueRuntimeRole,validateFlowRuntimeTopology} from './flowRuntimeTopology.js';

export const FLOW_MAIN_SERVICE='crawler-queue-flow.service';
export function flowWorkerService(role){
 if(![...FLOW_WORKER_ROLES,...FLOW_ISOLATED_WORKER_ROLES].includes(role))throw Error('FLOW_WORKER_ROLE_INVALID');
 return 'crawler-queue-worker@'+role+'.service';
}
export function flowServiceSpecs({topology,specs,externalUid=true}={}){
 validateFlowRuntimeTopology(topology);
 const enabled=specs.filter(q=>!externalUid||q.kind!=='uid');
 if(topology?.mode!=='split')return[{service:FLOW_MAIN_SERVICE,role:'all',queueNames:enabled.map(q=>q.name)}];
 return[{service:FLOW_MAIN_SERVICE,role:'coordinator',queueNames:[]},...flowWorkerRoles(topology).map(role=>({service:flowWorkerService(role),role,queueNames:enabled.filter(q=>queueRuntimeRole(q,topology)===role).map(q=>q.name)}))];
}
export function pulseMatchesService({pulse,service,role,now=Date.now(),maxAgeMs=60000,strictRole=false}={}){
 if(service?.ActiveState!=='active'||!pulse||Number(service.MainPID)<=0||pulse.pid!==Number(service.MainPID))return false;
 if(strictRole?pulse.role!==role:pulse.role&&pulse.role!==role)return false;
 const age=now-Date.parse(pulse.at);
 return Number.isFinite(age)&&age>=-5000&&age<maxAgeMs;
}
export function sourceRuntimeTelemetry({topology,services,pulses,now=Date.now()}={}){
 validateFlowRuntimeTopology(topology);
 const roles=topology?.mode==='split'?flowSourceRoles(topology):['all'],missing=[],selected=[],byRole={};
 for(const role of roles){const service=services.find(s=>s.Id===(role==='all'?FLOW_MAIN_SERVICE:flowWorkerService(role))),pulse=pulses[role];
  const fresh=pulseMatchesService({pulse,service,role,now,strictRole:topology?.mode==='split'});byRole[role]={fresh,eventLoopP99Ms:fresh?pulse.eventLoopP99Ms||0:0,eventLoopUtilization:fresh?pulse.eventLoopUtilization||0:0};
  if(!fresh)missing.push(role);else selected.push(pulse);
 }
 return{fresh:missing.length===0&&selected.length===roles.length,roles,missing,byRole,eventLoopP99Ms:Math.max(0,...selected.map(p=>p.eventLoopP99Ms||0)),eventLoopUtilization:Math.max(0,...selected.map(p=>p.eventLoopUtilization||0))};
}
