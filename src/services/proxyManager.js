import {createProxyQueueTraffic}from'./proxyQueueTraffic.js';
import {isIP}from'node:net';
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {createProxyVnRotator} from '../../scripts/proxyvn_rotator.js';import {validProxyScope} from './proxyScope.js';
import {validProxyQueue} from './crawlerQueueContext.js';
import {proxyEndpoint,proxyEgressEndpoint} from './proxyEndpoint.js';
import {verifyProxyEgress}from'./proxyEgressVerification.js';
import {PROXY_TLS_AVOID_MS,PROXY_CONNECT_AVOID_MS,validEndpoint,isProxyTlsFailure,isProxyConnectFailure} from './proxyAvoidance.js';
import {createBackgroundProxyRing} from './backgroundProxyRing.js';
const scopedEndpoint=(scope,endpoint)=>`${scope}|${endpoint}`;
const transportFailureHistoryMs=10*60*1000;
const defaultVerifyEgress=proxy=>verifyProxyEgress(proxy,{timeoutMs:8000});
const egressNetworkCodes=new Set(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE','EHOSTUNREACH','ENETUNREACH','ABORT_ERR']);
const transportHistoryUntil=row=>row?.recoveryRounds&&Number.isFinite(row.failedAt)?row.failedAt+transportFailureHistoryMs:Number.isFinite(row?.windowStartedAt)?row.windowStartedAt+transportFailureHistoryMs:row?.until||0;
const fail=(code,retryAfterMs=null)=>Object.assign(Error(code),{code,retryAfterMs});
const id=key=>createHash('sha256').update(key).digest('hex').slice(0,24);
function atomic(file,data){if(!file)return;fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data)+'\n',{mode:0o600});fs.renameSync(tmp,file);}
function keysOf(value){const rows=Array.isArray(value)?value:value?.keys;if(!Array.isArray(rows)||rows.length>10000)throw fail('PROXY_KEYS_INVALID');const keys=[];for(const row of rows){const key=typeof row==='string'?row:row?.key;if(typeof key!=='string'||! /^[A-Za-z0-9_-]{8,512}$/.test(key))throw fail('PROXY_KEYS_INVALID');if(row?.enabled!==false)keys.push(key);}return [...new Set(keys)];}
function validateSettings(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.entries(value.apiPolicies||{}).some(([k,v])=>!validProxyScope(k)||!v||typeof v!=='object'||['minIntervalMs','rateCooldownMs'].some(x=>v[x]!==undefined&&(!Number.isFinite(v[x])||v[x]<0||v[x]>86400000||x==='rateCooldownMs'&&v[x]<1000))))throw fail('PROXY_SETTINGS_INVALID');
 for(const [field,min,max]of [['maxLeasesPerKey',1,50],['apiReservedKeyCount',0,10000],['backgroundMaxLeases',1,10000],['refreshConcurrency',1,32],['backgroundActiveKeyCount',1,10000]])if(value[field]!==undefined&&(!Number.isInteger(value[field])||value[field]<min||value[field]>max))throw fail('PROXY_SETTINGS_INVALID');
 const standby=value.backgroundQueueStandbyKeys;if(standby!==undefined&&(!standby||typeof standby!=='object'||Array.isArray(standby)||Object.entries(standby).some(([queue,count])=>!validProxyQueue(queue)||!Number.isInteger(count)||count<0||count>8)||Object.values(standby).reduce((a,b)=>a+b,0)>8))throw fail('PROXY_SETTINGS_INVALID');
 const egress=value.backgroundQueueVerifyEgress;if(egress!==undefined&&(!egress||typeof egress!=='object'||Array.isArray(egress)||Object.entries(egress).some(([queue,enabled])=>!validProxyQueue(queue)||typeof enabled!=='boolean')))throw fail('PROXY_SETTINGS_INVALID');
 const required=value.backgroundQueueRequireVerifiedEgress;if(required!==undefined&&(!required||typeof required!=='object'||Array.isArray(required)||Object.entries(required).some(([queue,enabled])=>!validProxyQueue(queue)||typeof enabled!=='boolean'||enabled&&value.backgroundQueueVerifyEgress?.[queue]!==true)))throw fail('PROXY_SETTINGS_INVALID');
 const mainEgress=value.backgroundQueueVerifyMainEgress;if(mainEgress!==undefined&&(!mainEgress||typeof mainEgress!=='object'||Array.isArray(mainEgress)||Object.entries(mainEgress).some(([queue,enabled])=>!validProxyQueue(queue)||typeof enabled!=='boolean')))throw fail('PROXY_SETTINGS_INVALID');
 const mainRepair=value.backgroundQueueRepairMainTransport;if(mainRepair!==undefined&&(!mainRepair||typeof mainRepair!=='object'||Array.isArray(mainRepair)||Object.entries(mainRepair).some(([queue,enabled])=>!validProxyQueue(queue)||typeof enabled!=='boolean')))throw fail('PROXY_SETTINGS_INVALID');
 for(const [field,min,max]of [['backgroundQueueMaxLeasesPerEndpoint',1,50],['backgroundQueueMinIntervalMs',0,10000]]){const rows=value[field];if(rows!==undefined&&(!rows||typeof rows!=='object'||Array.isArray(rows)||Object.entries(rows).some(([queue,n])=>!validProxyQueue(queue)||!Number.isInteger(n)||n<min||n>max)))throw fail('PROXY_SETTINGS_INVALID');}
 const coldProbe=value.backgroundQueueColdProbe;if(coldProbe!==undefined&&(!coldProbe||typeof coldProbe!=='object'||Array.isArray(coldProbe)||Object.entries(coldProbe).some(([queue,enabled])=>!validProxyQueue(queue)||typeof enabled!=='boolean')))throw fail('PROXY_SETTINGS_INVALID');
 if(value.unrestrictedSharing!==undefined&&typeof value.unrestrictedSharing!=='boolean')throw fail('PROXY_SETTINGS_INVALID');
 if(value.blockRejectedScopes!==undefined&&typeof value.blockRejectedScopes!=='boolean')throw fail('PROXY_SETTINGS_INVALID');
 if(value.blockAccessRequiredScopes!==undefined&&typeof value.blockAccessRequiredScopes!=='boolean')throw fail('PROXY_SETTINGS_INVALID');
 return value;
}
/** One coordinator owns all keys. Independent leases share an IP, never a cookie jar or an in-flight rotation. */
export function createProxyManager({keysFile,stateFile,settingsFile,now=Date.now,makeRotator=createProxyVnRotator,leaseIdleMs=120000,refreshMarginMs=90000,providerMinRotateMs=60000,maxLeaseMs=1800000,groupCommitMs=0,verifyEgress=defaultVerifyEgress,verifyTransportRecovery=verifyEgress===defaultVerifyEgress?proxy=>verifyProxyEgress(proxy,{service:'cloudflare',timeoutMs:8000}):null}={}){
 const slots=new Map(),leases=new Map(),permitQueues=new Map(),coldProbes=new Map(),scopeBlocks={},demandScopes=new Map();let configError=null,settings={},round=0,warmRound=0,ring=null;const totals={acquired:0,released:0,rotations:0,expired:0,failures:0,avoidedOriginAssignments:0,avoidedTlsAssignments:0,avoidedConnectAssignments:0,excludedAssignments:0,endpointWaits:0,warmTransportPermits:0,coldRecoveryPermits:0,coldRecoveryWaits:0,egressChecks:0,verifiedEgressChanges:0,egressVerificationFailures:0,coldProbeAssignmentSkips:0};
 const mainEgressPending=new Map();let mainEgressRound=0,closed=false;
 const mainTransportRepairs=new Map();
 const endpointPacing=new Map();
 const queueTraffic=createProxyQueueTraffic({now});
 let configRevision=null,configuredKeyCount=0;
 let saved={};if(stateFile&&fs.existsSync(stateFile)){try{saved=JSON.parse(fs.readFileSync(stateFile));}catch{throw fail('PROXY_STATE_INVALID');}}
 const egressTransitions=Array.isArray(saved.egressTransitions)?saved.egressTransitions.slice(-100):[];
 // Legacy global quarantines cannot identify the failed flow; do not restore them.
 const validScopedRow=([key,row])=>(validProxyScope(row?.scope)||validProxyQueue(row?.scope))&&validEndpoint(row?.endpoint)&&key===scopedEndpoint(row.scope,row.endpoint)&&Number.isFinite(row.until);
 const endpointAvoidance=new Map(Object.entries(saved.endpointAvoidance||{}).filter(entry=>validScopedRow(entry)&&Math.max(entry[1].until,transportHistoryUntil(entry[1]))>now()));
 const endpointScopeBlocks=new Map(Object.entries(saved.endpointScopeBlocks||{}).filter(entry=>validScopedRow(entry)&&entry[1].until>now()));
 function endpointHealth(scope,endpoint){const key=scopedEndpoint(scope,endpoint),transport=endpointAvoidance.get(key),origin=endpointScopeBlocks.get(key);return (origin?.until||0)>(transport?.until||0)?origin:transport;}
 const standbyOwners=new Map(Object.entries(saved.queueStandbyOwners||{}).filter(([,queue])=>validProxyQueue(queue)));
 const apiReserveIds=new Set(saved.apiReservedKeyIds||[]);Object.assign(scopeBlocks,saved.scopeBlocks||{});Object.assign(totals,saved.totals||{});
 const maxPerKey=()=>settings.unrestrictedSharing?Infinity:settings.maxLeasesPerKey||1;
 const active=s=>s.leaseIds.size;
 const standbyMaxPerKey=()=>Math.min(maxPerKey(),4);
 function writeSnapshot(){atomic(stateFile,{version:4,egressTransitions,endpointAvoidance:Object.fromEntries(endpointAvoidance),endpointScopeBlocks:Object.fromEntries(endpointScopeBlocks),backgroundRing:ring?.snapshot(),queueStandbyOwners:Object.fromEntries(standbyOwners),apiReservedKeyIds:[...apiReserveIds],scopeBlocks,totals,slots:[...slots.values()].map(s=>({id:s.id,proxy:s.proxy,expiresAt:s.expiresAt,nextRotateAt:s.nextRotateAt,scopes:s.scopes,lastError:s.lastError,disabled:s.disabled,generation:s.generation,queueEgress:s.queueEgress,mainTransportRepairHistory:s.mainTransportRepairHistory})),leases:[...leases.values()]});}

 const batching=Number.isInteger(groupCommitMs)&&groupCommitMs>0&&groupCommitMs<=50;
 let persistTimer=null,persistDirty=false,persistFailure=null,flushWaiters=[];
 function commitNow(throwFailure=false){
  if(persistTimer){clearTimeout(persistTimer);persistTimer=null;}
  const waiters=flushWaiters;flushWaiters=[];
  try{if(persistDirty){writeSnapshot();persistDirty=false;}persistFailure=null;for(const waiter of waiters)waiter.resolve();}
  catch(error){persistFailure=error;for(const waiter of waiters)waiter.reject(error);if(throwFailure)throw error;}
 }
 function persist(){
  if(!batching)return writeSnapshot();
  persistDirty=true;
  if(!persistTimer)persistTimer=setTimeout(()=>commitNow(),groupCommitMs);
 }
 function flush(){
  if(!batching)return Promise.resolve();
  if(!persistDirty&&!persistTimer)return persistFailure?Promise.reject(persistFailure):Promise.resolve();
  if(!persistTimer)persistTimer=setTimeout(()=>commitNow(),groupCommitMs);
  return new Promise((resolve,reject)=>flushWaiters.push({resolve,reject}));
 }
 function reload(){try{const revision=[keysFile,settingsFile].map(file=>{if(!file)return '-';try{const st=fs.statSync(file,{bigint:true});return [st.dev,st.ino,st.size,st.mtimeNs,st.ctimeNs].join(':');}catch(e){if(file===settingsFile&&e.code==='ENOENT')return 'missing';throw e;}}).join('|');if(revision===configRevision&&!configError)return{keyCount:configuredKeyCount};const keys=keysOf(JSON.parse(fs.readFileSync(keysFile,'utf8'))),keep=new Set(keys.map(id));if(settingsFile&&fs.existsSync(settingsFile))settings=validateSettings(JSON.parse(fs.readFileSync(settingsFile)));
  for(const slot of slots.values())slot.removed=!keep.has(slot.id);
  for(const key of keys){const keyId=id(key);if(slots.has(keyId)){slots.get(keyId).removed=false;continue;}const prior=(saved.slots||[]).find(x=>x.id===keyId)||{};slots.set(keyId,{id:keyId,acquire:makeRotator(key),proxy:prior.proxy||null,expiresAt:prior.expiresAt||0,nextRotateAt:prior.nextRotateAt||0,scopes:prior.scopes||{},lastError:prior.lastError||null,disabled:prior.disabled||false,generation:prior.generation||0,queueEgress:prior.queueEgress||{},mainTransportRepairHistory:prior.mainTransportRepairHistory||{},removed:false,rotating:false,leaseIds:new Set()});}
  if(settings.blockAccessRequiredScopes===false)for(const s of slots.values())for(const h of Object.values(s.scopes||{}))if(['auth_required','security_checkpoint'].includes(h.blockedStatus)||!h.blockedStatus&&/AUTH_REQUIRED|LOGIN|CHECKPOINT|UPSTREAM_HTTP_(401|403)/.test(h.blockedReason||'')){if(h.blockedGeneration!==undefined){h.accessRequiredGeneration=h.blockedGeneration;delete h.blockedGeneration;}}
  configError=null;configRevision=revision;configuredKeyCount=keep.size;return{keyCount:keep.size};
 }catch(e){configError=e.code||'PROXY_CONFIG_INVALID';if(!slots.size)throw fail(configError);return{keyCount:[...slots.values()].filter(s=>!s.removed).length,configError};}}
 reload();for(const original of saved.leases||[]){const l={...original,clientClass:original.clientClass||'api'};if(!slots.has(l.keyId)){const old=(saved.slots||[]).find(s=>s.id===l.keyId);if(old)slots.set(l.keyId,{...old,removed:true,rotating:false,leaseIds:new Set()});}const slot=slots.get(l.keyId);if(slot&&l.idleUntil>now()&&l.proxyExpiresAt>now()&&l.maxUntil>now()){leases.set(l.id,l);slot.leaseIds.add(l.id);}}
 function finish(l,reason){for(const[key,probe]of coldProbes)if(probe.leaseId===l.id)coldProbes.delete(key);slots.get(l.keyId)?.leaseIds.delete(l.id);leases.delete(l.id);totals[reason==='expired'?'expired':'released']++;}
 function sweep(){for(const[key,row]of endpointPacing)if(row.lastUsedAt<=now()-60000){endpointPacing.delete(key);permitQueues.delete(key);}for(const[key,probe]of coldProbes)if(probe.until<=now()||!leases.has(probe.leaseId))coldProbes.delete(key);for(const [key,row]of endpointScopeBlocks)if(row.until<=now())endpointScopeBlocks.delete(key);for(const [endpoint,row]of endpointAvoidance)if(Math.max(row.until,transportHistoryUntil(row))<=now())endpointAvoidance.delete(endpoint);for(const l of leases.values())if(l.idleUntil<=now()||l.proxyExpiresAt<=now()||l.maxUntil<=now())finish(l,'expired');for(const [key,s]of slots)if(s.removed&&!active(s)&&!s.rotating)slots.delete(key);}
 // Membership is stable during each synchronous selection. Snapshot once,
 // rather than rebuilding the ring for every sort/filter comparison.
 function ringMembership(){
  if(!ring?.enabled())return null;
  ring.sync();const snapshot=ring.snapshot(),cold=new Set(snapshot.coldKeyIds);
  return new Set(snapshot.activeKeyIds.filter(key=>!cold.has(key)));
 }
 function ensureApiReservation(){
  const desired=settings.apiReservedKeyCount||0;
  for(const key of apiReserveIds){const s=slots.get(key);if(!s||s.removed||s.disabled)apiReserveIds.delete(key);}
  while(apiReserveIds.size>desired)apiReserveIds.delete([...apiReserveIds].at(-1));
  const candidates=[...slots.values()];if(ring?.enabled()&&apiReserveIds.size>0&&candidates.length>1){const admitted=ringMembership();candidates.sort((a,b)=>Number(admitted.has(a.id))-Number(admitted.has(b.id)));}
  for(const s of candidates){if(apiReserveIds.size>=desired)break;if(!s.removed&&!s.disabled&&!apiReserveIds.has(s.id)&&![...s.leaseIds].some(key=>leases.get(key)?.clientClass==='background'))apiReserveIds.add(s.id);}
 }
 const policy=scope=>settings.apiPolicies?.[scope]||{};
 const recoveryEnabled=l=>l.clientClass==='background'&&settings.backgroundQueueColdProbe?.[l.queue]===true;
 const recoveryProbeMs=15000;
 const generationBlocked=(s,scope)=>settings.blockRejectedScopes===true&&!!s&&Number.isInteger(s.scopes?.[scope]?.blockedGeneration)&&s.scopes[scope].blockedGeneration===s.generation;
 function blocked(scope,s){if(ring?.enabled()&&s&&!apiReserveIds.has(s.id))return 0;return Math.max(scopeBlocks[scope]||0,scopeBlocks[scope.split('.')[0]+'.*']||0,s?.scopes?.[scope]?.cooldownUntil||0,generationBlocked(s,scope)?now()+1000:0)-now();}
 const verifiedQueue=(s,queue)=>settings.backgroundQueueVerifyEgress?.[queue]===true?s.queueEgress?.[queue]:null;
 const endpointFor=(s,queue)=>{const e=verifiedQueue(s,queue);return e?.ready&&e.generation===s.generation?e.endpoint:proxyEndpoint(s.proxy);};
 const excludedFor=(s,queue,excluded)=>{const e=verifiedQueue(s,queue);return excluded.has(endpointFor(s,queue))||!!(e&&(!e.ready&&excluded.has(e.endpoint)||(e.legacyExitAddresses||[e.baselineExitAddress]).includes(e.exitAddress)&&excluded.has(e.legacyEndpoint)));};
 const coldProbeWait=(s,queue,clientClass='background')=>{if(clientClass!=='background'||!settings.backgroundQueueColdProbe?.[queue])return 0;const probe=coldProbes.get(scopedEndpoint(queue,endpointFor(s,queue)));return probe&&leases.has(probe.leaseId)?Math.max(0,probe.until-now()):0;};
 async function observeEgress(proxy,{details=false}={}){totals.egressChecks++;try{const value=await verifyEgress(proxy);totals.egressChecks++;const second=await verifyEgress(proxy);if(!isIP(value)||value!==second)throw Object.assign(Error('UNSTABLE_EGRESS'),{code:'UNSTABLE_EGRESS'});return details?{exit:value}:value;}catch(error){totals.egressVerificationFailures++;const code=/^[A-Z][A-Z0-9_]{0,60}$/.test(error?.code||'')?error.code:'EGRESS_ERROR';totals.egressFailureCodes||={};totals.egressFailureCodes[code]=(totals.egressFailureCodes[code]||0)+1;return details?{exit:null,errorCode:code,transportFailure:error?.responseObserved===false&&egressNetworkCodes.has(code)}:null;}}
 const requireVerified=(s,queue,clientClass='background')=>clientClass==='background'&&settings.backgroundQueueRequireVerifiedEgress?.[queue]===true&&!(s.queueEgress?.[queue]?.ready&&s.queueEgress[queue].generation===s.generation);
 const trustedSource=row=>row?.sourceVerified===true&&validEndpoint(row.sourceEndpoint)&&(row.unattributedUntil||0)<=now();
 function reconcileAttributedCopies(s,queue){
  const e=s.queueEgress?.[queue];if(settings.backgroundQueueRequireVerifiedEgress?.[queue]!==true||!e?.ready||e.generation!==s.generation)return;
  let removed=false;for(const map of [endpointScopeBlocks,endpointAvoidance]){const key=scopedEndpoint(queue,e.endpoint),row=map.get(key);if(row?.attribution==='legacy_copy'&&trustedSource(row)&&row.sourceEndpoint!==e.endpoint){map.delete(key);removed=true;totals.misattributedCopiesRemoved=(totals.misattributedCopiesRemoved||0)+1;}}
  if(removed)e.legacyExitAddresses=(e.legacyExitAddresses||[]).filter(ip=>ip!==e.exitAddress);
 }
 function establishEgress(s,queue,proxy,exitAddress,generation,{inheritLegacy=false}={}){
  const previous=s.queueEgress?.[queue],legacyEndpoint=proxyEndpoint(proxy),endpoint=proxyEgressEndpoint(proxy,exitAddress);
  const baselineExitAddress=previous?.legacyEndpoint===legacyEndpoint?previous.baselineExitAddress:exitAddress;
  if(s.mainTransportRepairHistory)delete s.mainTransportRepairHistory[queue];
  // Unknown historical exits are conservatively bound to the first observed
  // exit. Keep the original block too: no generation-only block reset.
  const attributed=settings.backgroundQueueRequireVerifiedEgress?.[queue]===true;let skipped=0,inherited=0,unknownInherited=false;
  for(const map of [endpointScopeBlocks,endpointAvoidance]){const old=map.get(scopedEndpoint(queue,legacyEndpoint)),existing=map.get(scopedEndpoint(queue,endpoint));if(!old)continue;if(attributed&&trustedSource(old)&&old.sourceEndpoint!==endpoint){skipped++;continue;}if(inheritLegacy||!previous||previous.legacyEndpoint!==legacyEndpoint){if(!existing||old.until>existing.until){map.set(scopedEndpoint(queue,endpoint),{...old,endpoint,attribution:'legacy_copy',sourceEndpoint:old.sourceEndpoint||legacyEndpoint,sourceVerified:old.sourceVerified===true});inherited++;}if(!trustedSource(old))unknownInherited=true;}}
  const addAlias=attributed?unknownInherited||(!previous&&skipped===0):!previous||inheritLegacy||previous.legacyEndpoint!==legacyEndpoint;
  s.queueEgress||={};s.queueEgress[queue]={exitAddress,baselineExitAddress,legacyExitAddresses:[...new Set([...(previous?.legacyEndpoint===legacyEndpoint?previous.legacyExitAddresses||[previous.baselineExitAddress]:[]),...(addAlias?[exitAddress]:[])])].filter(Boolean).slice(-128),legacyEndpoint,endpoint,generation,ready:true,verifiedAt:now()};
  reconcileAttributedCopies(s,queue);
  egressTransitions.push({at:now(),queue,keyId:s.id,generation,previousGeneration:previous?.generation??null,previousEndpoint:previous?.endpoint||null,endpoint,comparison:previous?.exitAddress?previous.exitAddress===exitAddress?'same':'changed':'first_observation',inherited,skippedAttributedLegacy:skipped,blockedUntil:endpointHealth(queue,endpoint)?.until||0});if(egressTransitions.length>100)egressTransitions.shift();
  if(!inheritLegacy&&previous?.exitAddress&&previous.exitAddress!==exitAddress)totals.verifiedEgressChanges++;
 }
 const mainEgressQueues=()=>Object.entries(settings.backgroundQueueVerifyMainEgress||{}).filter(([queue,enabled])=>enabled&&settings.backgroundQueueVerifyEgress?.[queue]===true).map(([queue])=>queue);
 const legacyGuard=(queue,proxy)=>{const key=scopedEndpoint(queue,proxyEndpoint(proxy));return createHash('sha256').update(JSON.stringify([endpointScopeBlocks.get(key)||null,endpointAvoidance.get(key)||null])).digest('hex');};
 const hasQueueLease=(s,queue)=>[...s.leaseIds].some(key=>leases.get(key)?.queue===queue);
 const queueEndpointLimit=(queue,clientClass)=>clientClass==='background'?settings.backgroundQueueMaxLeasesPerEndpoint?.[queue]:undefined;
 const endpointLeases=(queue,endpoint)=>[...leases.values()].filter(l=>l.clientClass==='background'&&l.queue===queue&&l.proxyEndpoint===endpoint).length;
 const healthyPeer=(s,queue)=>Object.entries(s.scopes||{}).some(([peer,h])=>peer!==queue&&h.updatedAt>now()-60000&&['ok','partial','resolved'].includes(h.lastStatus));
 function startUnverifiedTransportRepair(admitted){
  if(typeof verifyTransportRecovery!=='function')return;
  for(const s of slots.values())for(const queue of mainEgressQueues()){
   const e=s.queueEgress?.[queue],v=e?.mainVerification;
   if(settings.backgroundQueueRepairMainTransport?.[queue]!==true||settings.backgroundQueueRequireVerifiedEgress?.[queue]!==true||!admitted.has(s.id)||s.removed||s.disabled||s.rotating||apiReserveIds.has(s.id)||active(s)||!s.proxy||s.expiresAt<=now()+60000||s.nextRotateAt>now()||mainEgressPending.has(scopedEndpoint(queue,s.id))||healthyPeer(s,queue)||(s.mainTransportRepairHistory?.[queue]?.nextAt||0)>now())continue;
   if(e?.ready&&e.generation===s.generation||v?.status!=='failed'||v.generation!==s.generation||v.at<now()-120000||v.transportFailure!==true||(v.consecutiveTransportFailures||0)<3)continue;
   const generation=s.generation,proxy=s.proxy,prior=s.mainTransportRepairHistory?.[queue];
   s.mainTransportRepairHistory||={};s.mainTransportRepairHistory[queue]={...prior,at:now(),nextAt:now()+60000};
   totals.mainUnverifiedTransportConfirmations=(totals.mainUnverifiedTransportConfirmations||0)+1;
   // The admission gate prevents native group failures on these keys. Require
   // three failed checks plus a different TLS origin before repairing an idle
   // assignment. A working echo, HTTP error or certificate failure is not proof.
   const task=Promise.resolve().then(async()=>{
    let failed=false;try{await verifyTransportRecovery(proxy);}catch(error){failed=error?.responseObserved===false&&egressNetworkCodes.has(error?.code);}
    if(!failed){totals.mainUnverifiedTransportVetoes=(totals.mainUnverifiedTransportVetoes||0)+1;return;}
    if(closed||settings.backgroundQueueRepairMainTransport?.[queue]!==true||settings.backgroundQueueRequireVerifiedEgress?.[queue]!==true||settings.backgroundQueueVerifyMainEgress?.[queue]!==true||s.removed||s.disabled||s.rotating||apiReserveIds.has(s.id)||!ringMembership().has(s.id)||s.generation!==generation||s.proxy!==proxy||s.queueEgress?.[queue]?.ready&&s.queueEgress[queue].generation===generation||active(s)||healthyPeer(s,queue)||s.expiresAt<=now()+60000){totals.mainUnverifiedTransportStale=(totals.mainUnverifiedTransportStale||0)+1;return;}
    const rounds=Math.min(5,(prior?.rounds||0)+1);s.mainTransportRepairHistory[queue]={rounds,at:now(),nextAt:now()+Math.min(900000,60000*2**(rounds-1))};
    totals.mainTransportRepairAttempts=(totals.mainTransportRepairAttempts||0)+1;
    await rotate(s,{freshNetwork:true});
    totals.mainTransportRotations=(totals.mainTransportRotations||0)+1;totals.mainUnverifiedTransportRotations=(totals.mainUnverifiedTransportRotations||0)+1;
   }).catch(()=>{totals.mainTransportRepairFailures=(totals.mainTransportRepairFailures||0)+1;}).finally(()=>{mainTransportRepairs.delete(s.id);if(!closed)persist();});
   mainTransportRepairs.set(s.id,{queue,task});return;
  }
 }
 function startMainTransportRepair(){
  if(closed||!ring?.enabled()||mainTransportRepairs.size)return;
  const admitted=ringMembership();
  for(const s of slots.values())for(const queue of mainEgressQueues()){
   if(settings.backgroundQueueRepairMainTransport?.[queue]!==true||!admitted.has(s.id)||s.removed||s.disabled||s.rotating||apiReserveIds.has(s.id)||active(s)||!s.proxy||s.expiresAt<=now()+60000||s.nextRotateAt>now()||mainEgressPending.has(scopedEndpoint(queue,s.id)))continue;
   const verification=s.queueEgress?.[queue]?.mainVerification,transport=endpointAvoidance.get(scopedEndpoint(queue,endpointFor(s,queue)));
   // An origin rejection alone never retires a shared assignment. Require a
   // failed independent egress check and repeated native transport failures.
   if(verification?.status!=='failed'||verification.generation!==s.generation||verification.at<now()-120000||!transport||transport.until<=now()||Math.max(transport.count||0,transport.recoveryRounds||0)<3||(s.mainTransportRepairHistory?.[queue]?.nextAt||0)>now())continue;
   if(healthyPeer(s,queue))continue;
   totals.mainTransportRepairAttempts=(totals.mainTransportRepairAttempts||0)+1;
   s.mainTransportRepairHistory||={};const previous=s.mainTransportRepairHistory[queue],rounds=Math.min(5,(previous?.rounds||0)+1);s.mainTransportRepairHistory[queue]={rounds,at:now(),nextAt:now()+Math.min(900000,60000*2**(rounds-1))};
   const task=rotate(s).then(()=>{totals.mainTransportRotations=(totals.mainTransportRotations||0)+1;}).catch(()=>{totals.mainTransportRepairFailures=(totals.mainTransportRepairFailures||0)+1;}).finally(()=>{mainTransportRepairs.delete(s.id);if(!closed)persist();});
   mainTransportRepairs.set(s.id,{queue,task});return;
  }
  startUnverifiedTransportRepair(admitted);
 }
 function startMainEgressChecks(){
  if(closed||!ring?.enabled())return;
  const admitted=ringMembership(),queues=mainEgressQueues(),candidates=[];
  for(const s of slots.values())for(const queue of queues){
   const e=s.queueEgress?.[queue];
   if(s.removed||s.disabled||s.rotating||apiReserveIds.has(s.id)||!s.proxy||s.expiresAt<=now()+30000||hasQueueLease(s,queue)||!admitted.has(s.id)&&(standbyOwners.has(s.id)||active(s)))continue;
   if(e?.ready&&e.generation===s.generation||e?.mainVerification?.nextAt>now()||mainEgressPending.has(scopedEndpoint(queue,s.id)))continue;
   candidates.push({s,queue});
  }
  if(!candidates.length)return;
  const offset=mainEgressRound++%candidates.length;
  for(const {s,queue}of [...candidates.slice(offset),...candidates.slice(0,offset)]){
   if(mainEgressPending.size>=2)break;
   const key=scopedEndpoint(queue,s.id),generation=s.generation,proxy=s.proxy,proof=s.queueEgress?.[queue]?.rotationProof;
   totals.mainEgressChecks=(totals.mainEgressChecks||0)+1;
   const task=Promise.resolve().then(()=>observeEgress(proxy,{details:true})).then(({exit,errorCode,transportFailure})=>{
    if(closed)return;
    // Verification never rotates or withholds a shared key from other queues.
    // A changed generation, in-flight rotation or newly acquired group lease
    // invalidates the result; existing leases keep their original identities.
    if(s.removed||apiReserveIds.has(s.id)||settings.backgroundQueueVerifyMainEgress?.[queue]!==true||settings.backgroundQueueVerifyEgress?.[queue]!==true||s.generation!==generation||s.proxy!==proxy||s.rotating||hasQueueLease(s,queue)||s.expiresAt<=now()+1000){totals.mainEgressStale=(totals.mainEgressStale||0)+1;return;}
    s.queueEgress||={};
    if(!exit){const previous=s.queueEgress[queue]?.mainVerification,streak=transportFailure?(previous?.generation===generation&&previous.transportFailure?(previous.consecutiveTransportFailures||0)+1:1):0;s.queueEgress[queue]={...s.queueEgress[queue],mainVerification:{at:now(),generation,status:'failed',nextAt:now()+60000,errorCode,transportFailure,consecutiveTransportFailures:streak}};return;}
    const knownBefore=proof?.generation===generation&&proof.legacyEndpoint===proxyEndpoint(proxy)&&proof.legacyGuard===legacyGuard(queue,proxy);
    const priorEndpoint=endpointFor(s,queue),priorBlocked=(endpointHealth(queue,priorEndpoint)?.until||0)>now();
    establishEgress(s,queue,proxy,exit,generation,{inheritLegacy:!knownBefore});
    s.queueEgress[queue].mainVerification={at:now(),generation,status:'verified',nextAt:0};
    totals.mainEgressVerified=(totals.mainEgressVerified||0)+1;
    if(priorBlocked&&(endpointHealth(queue,endpointFor(s,queue))?.until||0)<=now())totals.mainEgressRecovered=(totals.mainEgressRecovered||0)+1;
   }).catch(()=>{totals.mainEgressErrors=(totals.mainEgressErrors||0)+1;if(!closed&&s.generation===generation){s.queueEgress||={};s.queueEgress[queue]={...s.queueEgress[queue],mainVerification:{at:now(),status:'error',nextAt:now()+60000}};}}).finally(()=>{mainEgressPending.delete(key);if(!closed){try{persist();startMainEgressChecks();}catch{totals.mainEgressErrors=(totals.mainEgressErrors||0)+1;}}});
   mainEgressPending.set(key,task);
  }
 }
 async function rotate(s,{freshNetwork=false,egressQueue=null}={}){if(s.rotating||active(s))throw fail('PROXY_POOL_BUSY',1000);if(s.nextRotateAt>now())throw fail('PROXY_PROVIDER_COOLDOWN',s.nextRotateAt-now());s.rotating=true;
  try{const verify=freshNetwork&&settings.backgroundQueueVerifyEgress?.[egressQueue]===true,egressQueues=verify?[egressQueue]:[];
   const beforeKnown=Object.fromEntries(egressQueues.map(queue=>[queue,s.queueEgress?.[queue]?.ready===true&&s.queueEgress[queue].generation===s.generation]));
   if(egressQueues.some(queue=>!beforeKnown[queue])&&s.proxy&&s.expiresAt>now()+1000){const before=await observeEgress(s.proxy);if(before)for(const queue of egressQueues)if(!beforeKnown[queue]){establishEgress(s,queue,s.proxy,before,s.generation,{inheritLegacy:true});beforeKnown[queue]=true;}}
   const rotationProofs=Object.fromEntries(mainEgressQueues().map(queue=>{const e=s.queueEgress?.[queue];return[queue,s.proxy&&s.expiresAt>now()+1000&&e?.ready&&e.generation===s.generation?{legacyEndpoint:proxyEndpoint(s.proxy),legacyGuard:legacyGuard(queue,s.proxy)}:null];}));
   const mainNetworkChange=!apiReserveIds.has(s.id)&&s.proxy&&mainEgressQueues().some(queue=>(endpointHealth(queue,endpointFor(s,queue))?.until||0)>now());
   if(mainNetworkChange&&!freshNetwork)totals.mainNetworkRotations=(totals.mainNetworkRotations||0)+1;
   const proxy=await s.acquire(freshNetwork||mainNetworkChange?{rotateNetwork:true,previousNetwork:s.proxy?.providerNetwork}:undefined);s.nextRotateAt=now()+providerMinRotateMs;const expiry=proxy.expiresAt;if(!Number.isFinite(expiry)||expiry<=now()+1000)throw fail('PROXY_TTL_UNKNOWN');if(settings.blockRejectedScopes)for(const h of Object.values(s.scopes))if(h.blockedGeneration===s.generation){h.previousAssignmentCooldownUntil=h.cooldownUntil||0;h.cooldownUntil=0;h.backoffUntil=0;h.nextAt=0;}s.proxy=proxy;s.expiresAt=expiry;s.nextRotateAt=now()+providerMinRotateMs;s.generation++;if(s.queueEgress)for(const e of Object.values(s.queueEgress))e.ready=false;for(const [queue,proof]of Object.entries(rotationProofs)){s.queueEgress[queue]||={};s.queueEgress[queue].rotationProof=proof?{...proof,generation:s.generation}:null;delete s.queueEgress[queue].mainVerification;}if(egressQueues.length){const after=await observeEgress(proxy);for(const queue of egressQueues){if(after)establishEgress(s,queue,proxy,after,s.generation,{inheritLegacy:!beforeKnown[queue]});else{s.queueEgress||={};s.queueEgress[queue]={...s.queueEgress[queue],endpoint:s.queueEgress[queue]?.endpoint||proxyEndpoint(proxy),generation:s.generation,ready:false};}}}s.lastError=null;s.disabled=false;totals.rotations++;return proxy;}
  catch(e){s.lastError=/^[A-Z_]+$/.test(e.code||'')?e.code:'PROXY_PROVIDER_ERROR';s.nextRotateAt=Math.max(s.nextRotateAt||0,now()+(e.retryAfterMs>0?e.retryAfterMs:30000));if(['PROXY_API_INVALID_KEY','PROXY_API_NO_ACTIVE_KEY','PROXY_API_KEY_EXPIRED'].includes(e.code))s.disabled=true;totals.failures++;throw fail(s.lastError,e.retryAfterMs);}
  finally{s.rotating=false;persist();}}
 function getLease(leaseId){sweep();const l=leases.get(leaseId);if(!l)throw fail('PROXY_LEASE_EXPIRED');return l;}
 ring=createBackgroundProxyRing({slots,apiReserveIds,activeLeases:active,now,rotate,getSettings:()=>settings,saved:saved.backgroundRing&&{...saved.backgroundRing,pending:Object.fromEntries(Object.entries(saved.backgroundRing.pending||{}).filter(([,row])=>row.reason==='PROXY_TTL_MARGIN'))}});
 const backgroundCount=()=>[...leases.values()].filter(l=>l.clientClass==='background').length;
 const backgroundCapacity=()=>settings.unrestrictedSharing?Infinity:Math.min(settings.backgroundMaxLeases||10000,(ring.enabled()?ring.status().targetKeys:[...slots.values()].filter(s=>!s.removed&&!s.disabled&&!apiReserveIds.has(s.id)).length)*maxPerKey());
 function syncStandby(){
  const admitted=ringMembership();
  for(const [key,queue]of standbyOwners){const slot=slots.get(key);if(!slot||slot.removed||slot.disabled||apiReserveIds.has(key)||admitted?.has(key)||!settings.backgroundQueueStandbyKeys?.[queue]&&!active(slot))standbyOwners.delete(key);}
 }
 function leaseSlot(s,scope,queue,clientClass,standby=false){
  const publicEndpoint=endpointFor(s,queue),endpoint=id(JSON.stringify([s.proxy.host,s.proxy.port,s.proxy.server,s.proxy.username]));
  const endpointLimit=queueEndpointLimit(queue,clientClass);if(endpointLimit!==undefined&&endpointLeases(queue,publicEndpoint)>=endpointLimit){totals.queueEndpointCapacityWaits=(totals.queueEndpointCapacityWaits||0)+1;return null;}
  if([...leases.values()].some(l=>l.endpoint===endpoint&&l.keyId!==s.id))return null;
  const lease={id:randomUUID(),keyId:s.id,scope,queue,clientClass,generation:s.generation,endpoint,proxyEndpoint:publicEndpoint,legacyProxyEndpoint:proxyEndpoint(s.proxy),proxyExpiresAt:s.expiresAt,idleUntil:Math.min(now()+leaseIdleMs,s.expiresAt),maxUntil:now()+maxLeaseMs};
  s.leaseIds.add(lease.id);leases.set(lease.id,lease);totals.acquired++;persist();
  const identity=verifiedQueue(s,queue),aliases=identity?(identity.ready?(identity.legacyExitAddresses||[identity.baselineExitAddress]).includes(identity.exitAddress)?[identity.legacyEndpoint]:[]:[identity.endpoint]):[];
  return{leaseId:lease.id,proxy:{...s.proxy,...(identity?.ready?{queueEndpoint:publicEndpoint}:{}),...(aliases.some(validEndpoint)?{queueEndpointAliases:aliases.filter(validEndpoint)}:{})},proxyExpiresAt:s.expiresAt,leaseExpiresAt:lease.idleUntil,generation:s.generation,maxLeasesPerKey:standby?standbyMaxPerKey():settings.unrestrictedSharing?null:maxPerKey(),apiReserved:apiReserveIds.has(s.id),rateCooldownMs:policy(scope).rateCooldownMs||900000};
 }
 async function acquireStandby({scope,queue,excluded,minRemainingMs,deadline}){
  const limit=settings.backgroundQueueStandbyKeys?.[queue]||0;if(!ring.enabled()||!queue||!limit)return null;
  syncStandby();
  // Ownership is not a permanent pin to two failed assignments. Once idle,
  // return a blocked spare and prefer another spare without touching its
  // queue block or rotating any key that another queue is using.
  for(const [key,owner]of standbyOwners){const slot=slots.get(key);if(owner!==queue||!slot||active(slot)||slot.rotating)continue;const endpoint=slot.proxy&&endpointFor(slot,queue),health=endpoint&&endpointHealth(queue,endpoint);if(requireVerified(slot,queue)||excludedFor(slot,queue,excluded)||health?.until>now()||(slot.scopes[queue]?.backoffUntil||0)>now()){standbyOwners.delete(key);persist();}}
  const waiting=ring.snapshot().waitingKeyIds,owned=waiting.filter(key=>standbyOwners.get(key)===queue),freshOwners=()=>[...standbyOwners.values()].filter(owner=>owner===queue).length;
  // Keep at least two unleased spare keys for normal ring replacement. Never
  // borrow an API key, a main-ring key, or a key draining another queue.
  const free=waiting.filter(key=>{const slot=slots.get(key);return slot&&!slot.removed&&!slot.disabled&&!slot.rotating&&!apiReserveIds.has(key)&&!standbyOwners.has(key)&&!active(slot);});
  const bad=key=>{const slot=slots.get(key),endpoint=slot.proxy&&endpointFor(slot,queue),health=endpoint&&endpointHealth(queue,endpoint);return Number(requireVerified(slot,queue)||excludedFor(slot,queue,excluded)||health?.until>now()||(slot.scopes[queue]?.backoffUntil||0)>now());};
  free.sort((a,b)=>bad(a)-bad(b)||(slots.get(a).nextRotateAt||0)-(slots.get(b).nextRotateAt||0));
  const additions=free.slice(0,Math.max(0,Math.min(limit-freshOwners(),free.length-2)));let rotated=0;
  for(const key of additions)if(!standbyOwners.has(key)&&freshOwners()<limit){standbyOwners.set(key,queue);persist();}
  const candidates=[...owned,...additions].sort((a,b)=>active(slots.get(a))-active(slots.get(b)));
  for(const key of candidates){
   const slot=slots.get(key);if(!slot||slot.removed||slot.disabled||slot.rotating||apiReserveIds.has(key)||active(slot)>=standbyMaxPerKey())continue;if(slot.proxy&&coldProbeWait(slot,queue)){totals.coldProbeAssignmentSkips++;continue;}
   if([...slot.leaseIds].some(id=>leases.get(id)?.queue!==queue))continue;
   if(!standbyOwners.has(key)){if(freshOwners()>=limit)continue;standbyOwners.set(key,queue);persist();}
   let endpoint=slot.proxy&&endpointFor(slot,queue),health=endpoint&&endpointHealth(queue,endpoint);
   const refresh=!slot.proxy||requireVerified(slot,queue)||slot.expiresAt-now()<minRemainingMs||excludedFor(slot,queue,excluded)||health?.until>now()||(slot.scopes[queue]?.backoffUntil||0)>now();
   if(refresh){
    // Rotate only an idle queue-owned spare, leaving every shared main key
    // and every existing lease in other queues untouched.
    if(active(slot)||slot.nextRotateAt>now()||rotated>=2||Date.now()>=deadline)continue;rotated++;
    let timer;try{await Promise.race([rotate(slot,{freshNetwork:true,egressQueue:queue}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('PROXY_POOL_BUSY',1000)),Math.max(1,deadline-Date.now()));})]);}catch{continue;}finally{clearTimeout(timer);}
   }
   const admitted=ringMembership();if(admitted.has(key)){standbyOwners.delete(key);continue;}
   endpoint=slot.proxy&&endpointFor(slot,queue);health=endpoint&&endpointHealth(queue,endpoint);
   if(slot.removed||slot.disabled||slot.rotating||requireVerified(slot,queue)||apiReserveIds.has(key)||standbyOwners.get(key)!==queue||active(slot)>=standbyMaxPerKey()||[...slot.leaseIds].some(id=>leases.get(id)?.queue!==queue)||slot.expiresAt-now()<minRemainingMs||coldProbeWait(slot,queue)||excludedFor(slot,queue,excluded)||health?.until>now()||backgroundCount()>=backgroundCapacity())continue;
   const lease=leaseSlot(slot,scope,queue,'background',true);if(lease)return lease;
  }
  return null;
 }
 return{
  reload,
  setKeys(value){const keys=keysOf(value);atomic(keysFile,{keys});const result=reload();ensureApiReservation();persist();return result;},
  async acquire({scope,queue=null,minRemainingMs=30000,clientClass='api',excludeProxyEndpoint=null,excludeProxyEndpoints=[]}={}){
   if(excludeProxyEndpoint!==null&&!validEndpoint(excludeProxyEndpoint)||!Array.isArray(excludeProxyEndpoints)||excludeProxyEndpoints.length>128||!excludeProxyEndpoints.every(validEndpoint))throw fail('PROXY_EXCLUSION_INVALID');
   if(queue!==null&&(!validProxyQueue(queue)||!(queue==='crawler-flow-find-uid'?scope?.startsWith('facebook.'):queue.startsWith('crawler-flow-'+scope?.split('.')[0]+'-'))))throw fail('PROXY_QUEUE_INVALID');
   const healthScope=queue||scope;
   const excluded=new Set([...excludeProxyEndpoints,...(excludeProxyEndpoint?[excludeProxyEndpoint]:[])]);
   if(!validProxyScope(scope)||!['api','background'].includes(clientClass)||!Number.isFinite(minRemainingMs)||minRemainingMs<1000||minRemainingMs>1800000)throw fail('PROXY_SCOPE_INVALID');reload();sweep();ensureApiReservation();if(ring.enabled()&&clientClass==='background')minRemainingMs=Math.max(minRemainingMs,60001);const global=ring.enabled()&&clientClass==='background'?0:blocked(healthScope);if(global>0)throw fail('PROXY_SCOPE_COOLDOWN',global);
   if(clientClass==='background'&&backgroundCount()>=backgroundCapacity())throw fail('PROXY_POOL_BUSY',1000);
   const available=[...slots.values()].filter(s=>!s.removed&&!s.disabled),ringEnabled=ring.enabled(),admitted=ringEnabled&&clientClass==='background'&&available.some(s=>!apiReserveIds.has(s.id))?ringMembership():null;let candidates=available.filter(s=>ringEnabled?(clientClass==='api'?apiReserveIds.has(s.id):!apiReserveIds.has(s.id)&&admitted.has(s.id)):(clientClass==='api'||!apiReserveIds.has(s.id)));if(!candidates.length){if(ringEnabled&&clientClass==='background'&&settings.backgroundQueueStandbyKeys?.[queue]){const standby=await acquireStandby({scope,queue,excluded,minRemainingMs,deadline:Date.now()+25000});if(standby)return standby;throw fail('PROXY_POOL_BUSY',1000);}throw fail([...slots.values()].some(s=>!s.removed&&!s.disabled)?'PROXY_API_RESERVE_ONLY':[...slots.values()].some(s=>!s.removed)?'PROXY_KEYS_UNAVAILABLE':'PROXY_POOL_EMPTY',5000);}
   const offset=round++%candidates.length;candidates=[...candidates.slice(offset),...candidates.slice(0,offset)];candidates.sort((a,b)=>(clientClass==='api'?Number(!apiReserveIds.has(a.id))-Number(!apiReserveIds.has(b.id)):0)||[...a.leaseIds].filter(id=>(leases.get(id)?.queue||leases.get(id)?.scope)===healthScope).length-[...b.leaseIds].filter(id=>(leases.get(id)?.queue||leases.get(id)?.scope)===healthScope).length||active(a)-active(b));
   let wait=5000,last,provisioned=0,endpointBlocked=0;const acquisitionDeadline=Date.now()+25000;
   for(const s of candidates){if(requireVerified(s,queue,clientClass)){endpointBlocked++;wait=Math.min(wait,5000);totals.unverifiedQueueWaits=(totals.unverifiedQueueWaits||0)+1;continue;}const priorEndpoint=s.proxy&&endpointFor(s,queue),priorAvoid=endpointHealth(healthScope,priorEndpoint);if(priorEndpoint&&(excludedFor(s,queue,excluded)||priorAvoid?.until>now())){endpointBlocked++;if(priorAvoid?.until>now())totals[priorAvoid.kind==='origin'?'avoidedOriginAssignments':priorAvoid.phase==='proxy_connect'?'avoidedConnectAssignments':'avoidedTlsAssignments']++;if(excludedFor(s,queue,excluded))totals.excludedAssignments++;wait=Math.min(wait,priorAvoid?.until>now()?priorAvoid.until-now():5000);continue;}if(s.proxy){const probeWait=coldProbeWait(s,queue,clientClass);if(probeWait){endpointBlocked++;totals.coldProbeAssignmentSkips++;wait=Math.min(wait,probeWait);continue;}}if(active(s)>=maxPerKey()||s.rotating)continue;const remaining=blocked(healthScope,s);if(remaining>0){wait=Math.min(wait,remaining);continue;}const backoff=s.scopes[healthScope]?.backoffUntil||0;if(backoff>now()){wait=Math.min(wait,backoff-now());continue;}
    if(s.expiresAt-now()<minRemainingMs){if(ring.enabled()&&clientClass==='background')continue;if(active(s))continue;if(s.nextRotateAt>now()){wait=Math.min(wait,s.nextRotateAt-now());continue;}if(provisioned>=2||Date.now()>=acquisitionDeadline)continue;provisioned++;let timer;try{await Promise.race([rotate(s),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('PROXY_POOL_BUSY',3000)),Math.max(1,acquisitionDeadline-Date.now()));})]);}catch(e){last=e;continue;}finally{clearTimeout(timer);}}
    if(s.removed||s.disabled||s.rotating||active(s)>=maxPerKey()||s.expiresAt-now()<minRemainingMs||coldProbeWait(s,queue,clientClass)||clientClass==='background'&&(apiReserveIds.has(s.id)||backgroundCount()>=backgroundCapacity()))continue;
    const publicEndpoint=endpointFor(s,queue),avoid=endpointHealth(healthScope,publicEndpoint);
    if(excludedFor(s,queue,excluded)||avoid?.until>now()){endpointBlocked++;if(avoid?.until>now())totals[avoid.kind==='origin'?'avoidedOriginAssignments':avoid.phase==='proxy_connect'?'avoidedConnectAssignments':'avoidedTlsAssignments']++;if(excludedFor(s,queue,excluded))totals.excludedAssignments++;wait=Math.min(wait,avoid?.until>now()?avoid.until-now():5000);continue;}
    const lease=leaseSlot(s,scope,queue,clientClass);if(lease)return lease;
   }
   if(clientClass==='background'){const standby=await acquireStandby({scope,queue,excluded,minRemainingMs,deadline:acquisitionDeadline});if(standby)return standby;}
   if(settings.blockRejectedScopes&&candidates.some(s=>generationBlocked(s,healthScope)))demandScopes.set(healthScope,now());
   if(endpointBlocked){totals.endpointWaits++;throw fail('PROXY_ENDPOINTS_UNAVAILABLE',Math.max(1,wait));}
   throw last||fail('PROXY_POOL_BUSY',Math.max(1,wait));
  },
  authorizeLease(leaseId,clientClass){const l=leases.get(leaseId);if(l&&l.clientClass!==clientClass)throw fail('PROXY_LEASE_FORBIDDEN');},
  heartbeat(leaseId){const l=getLease(leaseId),s=slots.get(l.keyId),wait=blocked(l.queue||l.scope,s);if(wait>0)throw fail('PROXY_SCOPE_COOLDOWN',wait);l.idleUntil=Math.min(now()+leaseIdleMs,l.proxyExpiresAt,l.maxUntil);persist();return{leaseExpiresAt:l.idleUntil,proxyExpiresAt:l.proxyExpiresAt};},
  // Failed cold handshakes do not revoke an established TLS tunnel. Origin
  // limits always revoke permits for this queue, including warm connections.
  permit(leaseId,{reuseTransport=false}={}){
   const l=getLease(leaseId),s=slots.get(l.keyId),wait=blocked(l.queue||l.scope,s);if(wait>0)throw fail('PROXY_SCOPE_COOLDOWN',wait);
   const healthKey=scopedEndpoint(l.queue||l.scope,l.proxyEndpoint),origin=endpointScopeBlocks.get(healthKey),transport=endpointAvoidance.get(healthKey),warmOnly=transport?.until>now();
   if(origin?.until>now())throw fail('PROXY_ENDPOINTS_UNAVAILABLE',origin.until-now());
   if(warmOnly&&!(reuseTransport&&transport.kind!=='origin'&&['proxy_connect','proxy_tls'].includes(transport.phase)))throw fail('PROXY_ENDPOINTS_UNAVAILABLE',transport.until-now());
   const recovering=recoveryEnabled(l),probe=recovering&&coldProbes.get(healthKey),peerProbe=probe&&probe.leaseId!==leaseId;
   if(recovering&&!warmOnly&&!reuseTransport&&peerProbe){totals.coldRecoveryWaits++;throw fail('PROXY_ENDPOINTS_UNAVAILABLE',Math.max(1,probe.until-now()));}
   const health=s.scopes[l.queue||l.scope]||={success:0,failed:0,cooldownUntil:0,nextAt:0},queueInterval=l.clientClass==='background'?settings.backgroundQueueMinIntervalMs?.[l.queue]:undefined,endpointLimit=queueEndpointLimit(l.queue,l.clientClass),interval=queueInterval!==undefined?endpointLimit?Math.min(queueInterval,Math.max(1,Math.floor(queueInterval*endpointLimit/Math.max(endpointLimit,endpointLeases(l.queue,l.proxyEndpoint))))):queueInterval:(settings.unrestrictedSharing?0:policy(l.scope).minIntervalMs||0),pacingKey=queueInterval!==undefined?scopedEndpoint(l.queue,l.proxyEndpoint):l.keyId+':'+(l.queue||l.scope);let pacingHealth=health;if(queueInterval!==undefined){for(const [key,row]of endpointPacing)if(row.lastUsedAt<now()-60000)endpointPacing.delete(key);pacingHealth=endpointPacing.get(pacingKey)||{nextAt:0};pacingHealth.lastUsedAt=now();endpointPacing.set(pacingKey,pacingHealth);}if(interval){const key=pacingKey,q=(permitQueues.get(key)||[]).filter(x=>leases.has(x.id)&&now()-x.at<Math.max(60000,interval*(queueEndpointLimit(l.queue,l.clientClass)||maxPerKey())*2));let position=q.findIndex(x=>x.id===leaseId);if(position<0){position=q.length;q.push({id:leaseId,at:now()});}else q[position].at=now();permitQueues.set(key,q);if(position>0||pacingHealth.nextAt>now()){if(l.clientClass==='background')queueTraffic.observe({queue:l.queue,endpoint:l.proxyEndpoint,paced:true});throw fail('PROXY_PACING_WAIT',Math.max(1,pacingHealth.nextAt-now())+position*interval);}q.shift();if(!q.length)permitQueues.delete(key);}else permitQueues.delete(pacingKey);pacingHealth.nextAt=now()+interval;
   if(recovering&&!warmOnly&&!reuseTransport&&!probe){coldProbes.set(healthKey,{leaseId,until:Math.min(now()+recoveryProbeMs,l.idleUntil,l.maxUntil,l.proxyExpiresAt)});totals.coldRecoveryPermits++;}
   l.idleUntil=Math.min(now()+leaseIdleMs,l.proxyExpiresAt,l.maxUntil);
   const requiresWarmTunnel=warmOnly||!!(recovering&&reuseTransport&&(!probe||peerProbe));
   if(requiresWarmTunnel)totals.warmTransportPermits++;
   if(l.clientClass==='background')queueTraffic.observe({queue:l.queue,endpoint:l.proxyEndpoint,reuseTransport});
   return{permitted:true,...(requiresWarmTunnel?{requiresWarmTunnel:true,retryAfterMs:Math.max(1,warmOnly?transport.until-now():probe?.until-now()||1000)}:{})};
  },
  report(leaseId,{status,reason,retryAfterMs,global=false,phase,nativeCode,connectStatus,responseObserved}={}){const l=getLease(leaseId),s=slots.get(l.keyId),h=s.scopes[l.queue||l.scope]||={success:0,failed:0,cooldownUntil:0,nextAt:0};if(!['ok','partial','resolved','error','proxy_error','rate_limited','auth_required','security_checkpoint','unavailable','sort_unavailable','unknown'].includes(status))throw fail('PROXY_REPORT_INVALID');h[status==='ok'||status==='partial'||status==='resolved'?'success':'failed']++;h.lastStatus=status;h.lastReason=/^[A-Z0-9_]+$/.test(reason||'')?reason:null;h.updatedAt=now();
   const reportedEndpoint=l.proxyEndpoint||(s.generation===l.generation&&s.proxy?proxyEndpoint(s.proxy):null),healthKey=scopedEndpoint(l.queue||l.scope,reportedEndpoint);
   const provenance={attribution:'native',sourceEndpoint:reportedEndpoint,sourceVerified:validEndpoint(l.legacyProxyEndpoint)&&reportedEndpoint!==l.legacyProxyEndpoint,sourceKeyId:l.keyId,sourceGeneration:l.generation};
   const transportFailure={reason,phase,nativeCode,connectStatus},tlsFailure=isProxyTlsFailure(transportFailure),connectFailure=isProxyConnectFailure(transportFailure);
   if(reportedEndpoint&&['error','proxy_error'].includes(status)&&(tlsFailure||connectFailure)){
    const prior=endpointAvoidance.get(healthKey),baseMs=tlsFailure?PROXY_TLS_AVOID_MS:PROXY_CONNECT_AVOID_MS,recovering=recoveryEnabled(l),sameEpisode=prior&&transportHistoryUntil(prior)>now(),recoveryRounds=recovering?(sameEpisode?Math.max(1,prior.recoveryRounds||1)+(prior.until<=now()?1:0):1):0,until=now()+(recovering?Math.min(300000,baseMs*2**Math.min(4,Math.max(0,recoveryRounds-1))):baseMs);
    const sameWindow=prior?.windowStartedAt!=null&&now()-prior.windowStartedAt<transportFailureHistoryMs;
    endpointAvoidance.set(healthKey,{...provenance,scope:l.queue||l.scope,endpoint:reportedEndpoint,until:Math.max(prior?.until||0,until),failedAt:now(),phase,reason:h.lastReason,...(recovering?{recoveryRounds}:{}),count:(prior?.count||0)+1,windowStartedAt:sameWindow?prior.windowStartedAt:now(),failuresInWindow:sameWindow?(prior.failuresInWindow||0)+1:1});
   }
   const legacyHealthKey=validEndpoint(l.legacyProxyEndpoint)&&l.legacyProxyEndpoint!==reportedEndpoint?scopedEndpoint(l.queue||l.scope,l.legacyProxyEndpoint):null;
   if(legacyHealthKey&&['error','proxy_error'].includes(status)&&(tlsFailure||connectFailure)){
    const row=endpointAvoidance.get(healthKey),prior=endpointAvoidance.get(legacyHealthKey);
    if(row)endpointAvoidance.set(legacyHealthKey,{...row,attribution:'legacy_alias',unattributedUntil:Math.max(prior?.unattributedUntil||0,prior&&!prior.sourceVerified?prior.until:0),endpoint:l.legacyProxyEndpoint,until:Math.max(row.until,prior?.until||0),recoveryRounds:Math.max(row.recoveryRounds||0,prior?.recoveryRounds||0)});
   }
   const probe=coldProbes.get(healthKey);if(probe?.leaseId===leaseId)coldProbes.delete(healthKey);
   // A native HTTP response proves transport recovery. It never clears a
   // quarantine that is still active, nor any origin/auth cooldown.
   if(reportedEndpoint&&responseObserved===true&&!tlsFailure&&!connectFailure&&(!recoveryEnabled(l)||probe?.leaseId===leaseId)){
    const prior=endpointAvoidance.get(healthKey);
    if(prior){if(prior.until<=now())endpointAvoidance.delete(healthKey);else endpointAvoidance.set(healthKey,{...prior,failuresInWindow:0,windowStartedAt:now(),lastSuccessAt:now()});}
   }
   const ringBackground=ring.enabled()&&l.clientClass==='background';
   // An origin rejection belongs to this endpoint and operation, never the
   // shared key ring. Keep the assignment usable by every other flow.
   const rateRejected=status==='rate_limited'||/RATE_LIMIT|HTTP_429/.test(reason||'');
   const accessRejected=settings.blockRejectedScopes===true&&settings.blockAccessRequiredScopes!==false&&['auth_required','security_checkpoint'].includes(status);
   if(reportedEndpoint&&(rateRejected||accessRejected)){
    const ms=Number.isFinite(retryAfterMs)&&retryAfterMs>0?Math.min(retryAfterMs,Number.MAX_SAFE_INTEGER-now()):policy(l.scope).rateCooldownMs||900000;
    const until=ringBackground?l.proxyExpiresAt:now()+ms,prior=endpointScopeBlocks.get(healthKey);
    endpointScopeBlocks.set(healthKey,{...provenance,scope:l.queue||l.scope,endpoint:reportedEndpoint,kind:'origin',status,reason:h.lastReason,failedAt:now(),until:Math.max(prior?.until||0,until)});
    if(legacyHealthKey){const legacy=endpointScopeBlocks.get(legacyHealthKey);endpointScopeBlocks.set(legacyHealthKey,{...provenance,attribution:'legacy_alias',unattributedUntil:Math.max(legacy?.unattributedUntil||0,legacy&&!legacy.sourceVerified?legacy.until:0),scope:l.queue||l.scope,endpoint:l.legacyProxyEndpoint,kind:'origin',status,reason:h.lastReason,failedAt:now(),until:Math.max(legacy?.until||0,until)});}
   }
   if(status==='rate_limited'&&!ringBackground){const ms=Number.isFinite(retryAfterMs)&&retryAfterMs>0?Math.min(retryAfterMs,Number.MAX_SAFE_INTEGER-now()):policy(l.scope).rateCooldownMs||900000;h.cooldownUntil=Math.max(h.cooldownUntil||0,now()+ms);if(global)scopeBlocks[l.queue||l.scope]=Math.max(scopeBlocks[l.queue||l.scope]||0,h.cooldownUntil);}
   if(!ringBackground&&settings.blockRejectedScopes&&(status==='rate_limited'||settings.blockAccessRequiredScopes!==false&&['auth_required','security_checkpoint'].includes(status))){h.blockedGeneration=s.generation;h.blockedAt=now();h.blockedReason=h.lastReason;h.blockedStatus=status;}
   if(['error','proxy_error'].includes(status)&&/NETWORK|TIMEOUT|CONNECT|TUNNEL/.test(reason||''))h.backoffUntil=now()+10000;
   if(reason==='PROXY_AUTH_REQUIRED'){s.disabled=true;s.lastError=reason;}persist();return{recorded:true,retryAfterMs:status==='rate_limited'&&!ringBackground?Math.max(0,h.cooldownUntil-now()):null};},
  recheck(keyId){const s=slots.get(keyId);if(!s||s.removed)throw fail('PROXY_KEY_INVALID');if(active(s)||s.rotating)throw fail('PROXY_POOL_BUSY',1000);s.disabled=false;s.lastError=null;persist();return{scheduled:true};},
  setSettings(value){settings=validateSettings(value);atomic(settingsFile,settings);ensureApiReservation();persist();return{updated:true};},
  release(leaseId){const l=leases.get(leaseId);if(l)finish(l,'released');persist();return{released:true};},
  importCooldowns(deadlines){for(const [scope,deadline]of Object.entries(deadlines))if((validProxyScope(scope)||/^(facebook|threads|instagram|youtube)\.\*$/.test(scope))&&Number.isFinite(deadline)&&deadline>now())scopeBlocks[scope]=Math.max(scopeBlocks[scope]||0,deadline);persist();},
  async tick(){reload();sweep();ensureApiReservation();for(const s of slots.values())for(const queue of mainEgressQueues())reconcileAttributedCopies(s,queue);startMainTransportRepair();startMainEgressChecks();if(ring.enabled())await ring.tick();const all=[...slots.values()],work=[],pressure=[...demandScopes].filter(([,t])=>now()-t<30000).map(([scope])=>scope),recentScopes=[...new Set(all.flatMap(s=>Object.entries(s.scopes).filter(([,h])=>now()-(h.updatedAt||0)<900000).map(([scope])=>scope)))];for(let i=0;i<all.length&&work.length<(settings.refreshConcurrency||2);i++){const s=all[warmRound++%all.length],allBlocked=recentScopes.length>0&&recentScopes.every(scope=>generationBlocked(s,scope)),needed=pressure.some(scope=>generationBlocked(s,scope));if((!ring.enabled()||apiReserveIds.has(s.id))&&!s.removed&&!s.disabled&&!active(s)&&!s.rotating&&(s.expiresAt-now()<refreshMarginMs||allBlocked||needed)&&s.nextRotateAt<=now())work.push(s);}await Promise.allSettled(work.map(rotate));persist();},
  status(){sweep();ensureApiReservation();syncStandby();const live=[...slots.values()].filter(s=>!s.removed),backgroundLeases=backgroundCount(),histogram={};for(const s of live)histogram[active(s)]=(histogram[active(s)]||0)+1;const ringStatus=ring.status(),ringEnabled=ring.enabled(),admitted=ringMembership();return{status:configError?'degraded':'ok',configError,queueTraffic:queueTraffic.snapshot(),endpointAvoidance:[...endpointAvoidance].filter(([,row])=>row.until>now()).map(([,row])=>({...row})),coldRecoveryProbes:[...coldProbes].map(([key,probe])=>({scope:key.split('|')[0],endpoint:key.split('|')[1],until:probe.until})),backgroundQueueColdProbe:{...settings.backgroundQueueColdProbe},backgroundQueueVerifyEgress:{...settings.backgroundQueueVerifyEgress},backgroundQueueRequireVerifiedEgress:{...settings.backgroundQueueRequireVerifiedEgress},egressTransitions:[...egressTransitions],backgroundQueueVerifyMainEgress:{...settings.backgroundQueueVerifyMainEgress},backgroundQueueRepairMainTransport:{...settings.backgroundQueueRepairMainTransport},backgroundQueueMaxLeasesPerEndpoint:{...settings.backgroundQueueMaxLeasesPerEndpoint},backgroundQueueMinIntervalMs:{...settings.backgroundQueueMinIntervalMs},mainTransportRepairs:[...mainTransportRepairs].map(([keyId,row])=>({keyId,queue:row.queue})),mainEgressVerification:{inFlight:[...mainEgressPending.keys()].map(key=>{const i=key.lastIndexOf('|');return{queue:key.slice(0,i),keyId:key.slice(i+1)};}),checks:[...slots.values()].flatMap(s=>Object.entries(s.queueEgress||{}).filter(([,e])=>e.mainVerification).map(([queue,e])=>({keyId:s.id,queue,...e.mainVerification})))},queueEgress:[...slots.values()].flatMap(s=>Object.entries(s.queueEgress||{}).map(([queue,e])=>({keyId:s.id,queue,endpoint:endpointFor(s,queue),lastVerifiedEndpoint:e.endpoint,generation:e.generation,ready:e.ready,verifiedAt:e.verifiedAt}))),endpointScopeBlocks:[...endpointScopeBlocks.values()].map(row=>({...row})),transportFailureHistory:[...endpointAvoidance].map(([,row])=>({endpoint:row.endpoint,scope:row.scope,failuresInWindow:row.failuresInWindow||0,windowStartedAt:row.windowStartedAt,historyUntil:transportHistoryUntil(row),quarantinedUntil:row.until,retirementRequestedAt:row.retirementRequestedAt,lastSuccessAt:row.lastSuccessAt})),keyCount:live.length,readyKeys:live.filter(s=>!s.disabled&&s.expiresAt>now()+30000).length,idleReadyKeys:live.filter(s=>!s.disabled&&!active(s)&&!s.rotating&&s.expiresAt>now()+30000).length,activeLeases:leases.size,maxLeasesPerKey:settings.unrestrictedSharing?null:maxPerKey(),apiReservedKeyCount:apiReserveIds.size,apiReservedConfigured:settings.apiReservedKeyCount||0,backgroundKeyCount:live.filter(s=>!s.disabled&&!apiReserveIds.has(s.id)).length,unrestrictedSharing:settings.unrestrictedSharing===true,backgroundLeaseCapacity:settings.unrestrictedSharing?null:backgroundCapacity(),backgroundRing:ringStatus,backgroundActiveLeases:backgroundLeases,apiActiveLeases:leases.size-backgroundLeases,keyLeaseHistogram:histogram,totals:{...totals},scopeBlocks:{...scopeBlocks},apiPolicies:settings.apiPolicies||{},queueStandby:Object.entries(settings.backgroundQueueStandbyKeys||{}).map(([queue,limit])=>({queue,limit,maxLeasesPerKey:standbyMaxPerKey(),keyIds:[...standbyOwners].filter(([,owner])=>owner===queue).map(([key])=>key)})),keys:[...slots.values()].map(s=>({keyId:s.id,draining:s.removed||(ringEnabled&&!apiReserveIds.has(s.id)&&!admitted.has(s.id)&&!standbyOwners.has(s.id)&&active(s)>0),standbyQueue:standbyOwners.get(s.id)||null,backgroundAdmitted:ringEnabled&&!apiReserveIds.has(s.id)&&admitted.has(s.id),leased:active(s)>0,leaseCount:active(s),apiReserved:apiReserveIds.has(s.id),backgroundLeases:[...s.leaseIds].filter(k=>leases.get(k)?.clientClass==='background').length,rotating:s.rotating,disabled:s.disabled,proxyExpiresAt:s.expiresAt||null,generation:s.generation,lastError:s.lastError,scopes:s.scopes}))};},
  flush,
  async settleEgressVerification(){while(mainEgressPending.size)await Promise.allSettled([...mainEgressPending.values()]);},
  async settleTransportRepair(){await Promise.allSettled([...mainTransportRepairs.values()].map(row=>row.task));},
  close(){if(closed)return;closed=true;if(batching){persistDirty=true;commitNow(true);}else persist();}
 };
}
