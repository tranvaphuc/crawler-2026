// Only public health evidence crosses SSH. Facebook credentials stay local.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {profileUidFromSnapshot} from '../src/services/facebookFindUid.js';
import {facebookProfileDiagnostics} from '../src/services/facebookProfileDiagnostics.js';
import {facebookPublicAuthorProfileUrl,facebookAuthorProfileKey} from '../src/services/facebookAuthorIdentity.js';
import {createLocalUidAccountUsage} from '../src/services/localUidAccountUsage.js';
import {trackedUidRequest} from '../src/services/localUidTrackedRequest.js';

const dir='outputs/local-uid-worker-2026-10-29',local=JSON.parse(fs.readFileSync(dir+'/header-refresh-status.json','utf8')),url=local.healthProbeTarget||'https://www.facebook.com/tranvanphuc75';
if(!facebookAuthorProfileKey(url)||facebookPublicAuthorProfileUrl({profileUrl:url})!==url)throw Error('INVALID_PUBLIC_PROFILE_PROBE');
const usage=createLocalUidAccountUsage({dir}),snapshot=await trackedUidRequest({dir,url,usage,purpose:'health_probe'}),native=profileUidFromSnapshot(snapshot,url),diagnostic=native?null:facebookProfileDiagnostics(snapshot,url);
usage.observe(snapshot,{proof:native,diagnostic});
if(!native){usage.saveSummary();console.log(JSON.stringify({verified:false,reason:diagnostic.reason}));process.exit(2);}
const currentConfig=fs.readFileSync(dir+'/curl.credentials.conf','utf8');
if(usage.context(currentConfig).sessionKey===snapshot.uidUsageRef.sessionKey&&['Phúc 1','Phúc 2','Phúc 3','Lý Minh Trường'].includes(local.browserProfile))usage.register(currentConfig,local.browserProfile);
usage.saveSummary();
const proof={checkedAt:new Date().toISOString(),browserProfile:local.browserProfile,target:url,uid:native.id,evidence:native.evidence,nativeUidProof:true};
const remote=`sudo -n bash <<'UID_HEALTH_ROOT'
set -eu
cd /opt/crawler-v8/current
set -a
source /etc/crawler-v8/runtime.env
set +a
/opt/crawler-node/bin/node --input-type=module <<'UID_HEALTH_JS'
import fs from 'node:fs';import {MongoClient} from 'mongodb';import Redis from 'ioredis';import {Queue} from 'bullmq';
const proof=${JSON.stringify(proof)},p='/var/lib/crawler-v8/performance-watch/uid-feature-block.json';
if(Date.now()-Date.parse(proof.checkedAt)>300000)throw Error('UID_PROOF_EXPIRED');
const old=fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):null;
if(Date.parse(old?.lastProbeAt||old?.pausedAt||0)>Date.parse(proof.checkedAt))throw Error('NEWER_UID_BLOCK_REQUIRES_RECHECK');
const dbClient=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:10000,maxPoolSize:2,maxIdleTimeMS:10000}),redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:1}),q=new Queue('crawler-flow-find-uid',{connection:redis});
try{
 await dbClient.connect();
 const backup=p+'.before-recovery-'+Date.parse(proof.checkedAt);if(old)fs.copyFileSync(p,backup,fs.constants.COPYFILE_EXCL);
 const next={...old,status:'recovered',recoveredAt:proof.checkedAt,currentBrowserProfile:proof.browserProfile,lastProbeAt:proof.checkedAt,lastProbe:{...proof,method:'local_curl_native_profile_proof'},probeNotBefore:null,policy:'preserve_jobs_require_current_profile_native_proof',evidence:'Current authorized local session has native UID proof; prior profile block is historical.',history:[...(old?.history||[]),{at:proof.checkedAt,result:'NATIVE_UID_PROVEN',browserProfile:proof.browserProfile}].slice(-30)};
 fs.mkdirSync('/var/lib/crawler-v8/performance-watch',{recursive:true,mode:0o700});const tmp=p+'.recovery.tmp';fs.writeFileSync(tmp,JSON.stringify(next,null,2)+'\\n',{mode:0o600});if(old){const stat=fs.statSync(p);fs.chownSync(tmp,stat.uid,stat.gid);}fs.chmodSync(tmp,0o600);fs.renameSync(tmp,p);
 await dbClient.db().collection('flow_performance_events').updateMany({queue:'find-uid',kind:{$in:['FACEBOOK_UID_FEATURE_BLOCK','UID_PAUSE_GUARD_RESTORED']}},{$set:{status:'resolved',resolvedAt:new Date(proof.checkedAt),resolution:'CURRENT_LOCAL_PROFILE_NATIVE_UID_PROVEN',browserProfile:proof.browserProfile}});
 await dbClient.db().collection('flow_queue_mutation_audit').insertOne({_id:'uid-health:'+proof.checkedAt,at:new Date(),source:'local_uid_health_reconciliation',queue:q.name,action:'reconcile_origin_health',state:'completed',proof,previousStatus:old?.status||null});
 ${process.argv.includes('--resume')?"if(await q.isPaused())await q.resume();":''}
 console.log(JSON.stringify({reconciled:true,status:next.status,browserProfile:proof.browserProfile,nativeUidProof:true,isPaused:await q.isPaused(),counts:await q.getJobCounts('waiting','active','failed','paused'),backup:old?backup:null}));
}finally{await q.close();await redis.quit();await dbClient.close();}
UID_HEALTH_JS
UID_HEALTH_ROOT
`;
if(!process.argv.includes('--apply')){console.log(JSON.stringify({verified:true,proof,applyRequired:true}));process.exit(0);}
const file=path.join(os.tmpdir(),'uid-health-reconcile-'+process.pid+'.sh');
try{fs.writeFileSync(file,remote,{mode:0o600});const applied=spawnSync(process.execPath,['scripts/crawl_remote_admin.mjs','exec',file],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024});process.stdout.write(applied.stdout||'');if(applied.status!==0)process.exitCode=1;else{const status={...local,checkedAt:proof.checkedAt,currentHeaderCheck:proof,originHealthReconciledAt:proof.checkedAt,healthReconciliation:{applied:true,checkedAt:proof.checkedAt,browserProfile:proof.browserProfile,nativeUidProof:true}};const tmp=dir+'/header-refresh-status.json.tmp';fs.writeFileSync(tmp,JSON.stringify(status,null,2),{mode:0o600});fs.chmodSync(tmp,0o600);fs.renameSync(tmp,dir+'/header-refresh-status.json');}}finally{fs.unlinkSync(file);}
