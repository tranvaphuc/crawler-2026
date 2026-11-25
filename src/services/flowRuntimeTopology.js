import fs from 'node:fs';

export const FLOW_SPLIT_TOPOLOGY_VERSION=2;
export const FLOW_WORKER_ROLES=Object.freeze(['facebook-sources','facebook-comments','social','social-comments','imports']);
export const FLOW_ISOLATED_WORKER_ROLES=Object.freeze(['facebook-page-sources','facebook-group-sources','facebook-user-sources','facebook-comments','facebook-replies','social','social-comments','imports']);
export const flowWorkerRoles=topology=>topology?.version===3?FLOW_ISOLATED_WORKER_ROLES:FLOW_WORKER_ROLES;
export const flowSourceRoles=topology=>topology?.version===3?['facebook-page-sources','facebook-group-sources','facebook-user-sources','social']:['facebook-sources','social'];
export const FLOW_SPLIT_ROLES=Object.freeze(['coordinator',...FLOW_WORKER_ROLES]);
export function queueRuntimeRole(spec,topology){
 if(spec.kind==='import'||spec.kind==='uid')return 'imports';
 if(topology?.version===3&&spec.platform==='facebook'){
  if(spec.kind==='source')return 'facebook-'+spec.type+'-sources';
  return spec.kind==='reply'?'facebook-replies':'facebook-comments';
 }
 if(spec.platform==='facebook')return spec.kind==='source'?'facebook-sources':'facebook-comments';
 return spec.kind==='source'?'social':'social-comments';
}
export function validateFlowRuntimeTopology(topology){
 if(!topology)return;
 if(!['single','split'].includes(topology.mode)||!(topology.mode==='split'?[2,3].includes(topology.version):[1,FLOW_SPLIT_TOPOLOGY_VERSION].includes(topology.version)))throw Error('FLOW_TOPOLOGY_INVALID');
}
export function flowRuntimePlan({role='all',topology=null,specs,externalUid=false}={}){
 if(!Array.isArray(specs))throw Error('FLOW_TOPOLOGY_SPECS_REQUIRED');
 const mode=topology?.mode||'single';
 validateFlowRuntimeTopology(topology);
 if(mode==='single'&&role!=='all'||mode==='split'&&!['coordinator',...flowWorkerRoles(topology)].includes(role))throw Error('FLOW_TOPOLOGY_ROLE_MISMATCH');
 const enabled=specs.filter(q=>!externalUid||q.kind!=='uid');
 const workers=role==='all'?enabled:role==='coordinator'?[]:enabled.filter(q=>queueRuntimeRole(q,topology)===role);
 return{role,mode,coordinator:role==='all'||role==='coordinator',workerSpecs:workers,
  lockKey:role==='all'||role==='coordinator'?'crawler-flow-runtime-lock':'crawler-flow-runtime-lock:'+role,
  pulseFile:role==='all'||role==='coordinator'?'/var/lib/crawler-v8/runtime-performance.json':'/var/lib/crawler-v8/runtime-performance-'+role+'.json'};
}
export function loadFlowRuntimeTopology(file){
 try{const topology=JSON.parse(fs.readFileSync(file,'utf8'));validateFlowRuntimeTopology(topology);return topology;}catch(e){if(e.code==='ENOENT')return null;throw Error('FLOW_TOPOLOGY_FILE_INVALID');}
}
export function assertFlowRolePartition(specs,{externalUid=false,topology={version:FLOW_SPLIT_TOPOLOGY_VERSION,mode:'split'}}={}){
 const assignments=new Map();
 for(const role of flowWorkerRoles(topology)){const plan=flowRuntimePlan({role,topology,specs,externalUid});for(const q of plan.workerSpecs){if(assignments.has(q.name))throw Error('FLOW_QUEUE_ROLE_DUPLICATE');assignments.set(q.name,role);}}
 if(assignments.size!==specs.filter(q=>!externalUid||q.kind!=='uid').length)throw Error('FLOW_QUEUE_ROLE_MISSING');
 return assignments;
}
