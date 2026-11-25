set -eu
sudo -n /opt/crawler-node/bin/node --env-file=/etc/crawler-v8/runtime.env --input-type=module <<'JS'
import fs from 'node:fs';
import {createRequire} from 'node:module';
const root='/opt/crawler-v8/current', require=createRequire(root+'/package.json');
const {MongoClient}=require('mongodb'), Redis=require('ioredis'), {Queue}=require('bullmq');
const {FLOW_QUEUES,queueName}=await import('file://'+root+'/src/services/crawlerQueueFlow.js');
const redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{connectTimeout:3000,commandTimeout:6000,maxRetriesPerRequest:1});
redis.on('error',()=>{});
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:5000,socketTimeoutMS:25000,maxPoolSize:2});
const queues=FLOW_QUEUES.map(({name})=>[name,new Queue(queueName(name),{connection:redis,skipMetasUpdate:true})]);
const until=new Date(),since=new Date(+until-7200000),limit=1000;

function category(value=''){
 const code=String(value).toUpperCase();
 if(/PROXY_KEYS_UNAVAILABLE|PROXY_POOL_EMPTY|PROXY_API_RESERVE_ONLY|KEY_EXPIRED|KEY_INVALID/.test(code))return 'Thiếu đường thu thập';
 if(/RATE_LIMIT|HTTP_429|ORIGIN_WAIT|ORIGIN_COOLDOWN/.test(code))return 'Bị giới hạn lượt đọc';
 if(/AUTH_REQUIRED|LOGIN|CHECKPOINT|SECURITY_CHALLENGE/.test(code))return 'Yêu cầu đăng nhập hoặc xác minh';
 if(/TIMEOUT|ECONN|TUNNEL|TLS|NETWORK|^PROXY_CONNECT/.test(code))return 'Kết nối gián đoạn hoặc quá hạn';
 if(/PROXY|PACING|PERMIT|ENDPOINT/.test(code))return 'Đang chờ đường thu thập khả dụng';
 if(/UID|AUTHOR|IDENTITY|SITEID/.test(code))return 'Thiếu định danh';
 if(/MAPPING|UNMAPPED|ES5|INDEX|IMPORT_WRITE/.test(code))return 'Lỗi ghi dữ liệu';
 if(/COVERAGE|INCOMPLETE|MISMATCH|NOT_RETURNED|UNAVAILABLE|EMPTY|NOT_FOUND/.test(code))return 'Nguồn trả thiếu dữ liệu';
 if(/SOURCE_YIELD|CHECKPOINT_RESUME/.test(code))return 'Chờ tiếp tục theo lịch quét';
 return 'Chưa rõ nguyên nhân';
}
const checked=(result)=>{if(result.some(([error])=>error))throw Error('Queue read failed');return result.map(([,value])=>value);};
async function queueStatus([name,q]){
 const delayed=q.toKey('delayed'),cutoff=+until*4096+4095;
 const [counts,paused,due]=await Promise.all([q.getJobCounts('waiting','active','delayed','failed','prioritized','paused','waiting-children'),q.isPaused(),redis.zcount(delayed,'-inf',cutoff)]);
 const reasons={};let examined=0;
 for(let start=0;start<Math.min(counts.delayed,limit);start+=50){
  const ids=await redis.zrange(delayed,start,Math.min(start+49,limit-1));
  if(!ids.length)break;
  const pipe=redis.pipeline();for(const id of ids)pipe.hget(q.toKey(id),'data');
  for(const payload of checked(await pipe.exec())){
   if(!payload)continue;
   let label='Chưa rõ nguyên nhân';
   try{const d=JSON.parse(payload);label=category(d.proxyWaitReason||(d.originWaitUntil?'ORIGIN_WAIT':null)||(d.sourceYieldUntil?'SOURCE_YIELD':null)||d.lastReadError?.reason);}catch{}
   reasons[label]=(reasons[label]||0)+1;examined++;
  }
 }
 return {name,...counts,pausedJobs:counts.paused,paused,due,delayedExamined:examined,delayedReasons:reasons};
}
try{
 const results=[];
 for(const queue of queues){try{results.push(await queueStatus(queue));}catch{results.push({name:queue[0],unavailable:true});}}
 let events=null;
 try{
  await mongo.connect();
  const rows=await mongo.db().collection('flow_error_events').aggregate([
   {$match:{at:{$gte:since,$lt:until}}},
   {$group:{_id:{queue:'$queue',kind:'$kind',reason:{$ifNull:['$originalReason','$code']}},count:{$sum:1}}},
  ],{maxTimeMS:18000}).toArray();
  const grouped=new Map(),known=new Set(FLOW_QUEUES.map(v=>v.name));
  for(const row of rows){
   const {queue,kind,reason}=row._id;
   const stage=['job_failed','request_error','read_retry','read_failure','runtime_error','partial_delivery_error'].includes(kind)?kind:'other';
   const values=[known.has(queue)?queue:'Hệ thống chung',stage,category(reason)],key=JSON.stringify(values);
   grouped.set(key,(grouped.get(key)||0)+row.count);
  }
  events=[...grouped].map(([key,count])=>{const [queue,stage,reason]=JSON.parse(key);return {queue,stage,reason,count};});
 }catch{}
 let proxy=null;
 try{
  const r=await fetch(new URL('/v1/status',process.env.PROXY_MANAGER_URL||'http://127.0.0.1:3810'),{headers:{Authorization:'Bearer '+process.env.PROXY_MANAGER_AUTH_KEY},signal:AbortSignal.timeout(5000)});
  if(r.ok){const d=await r.json();proxy={ready:d.readyKeys,api:d.apiReservedKeyCount,active:d.backgroundRing?.activeKeys,spares:d.backgroundRing?.waitingKeys};}
 }catch{}
 const serverMemory=Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1])||null;
 console.log(JSON.stringify({since,until,complete:events!==null&&results.every(row=>!row.unavailable),queues:results,events,proxy,availableMemoryKiB:serverMemory}));
}finally{await Promise.allSettled(queues.map(([,q])=>q.close()));redis.disconnect();await mongo.close().catch(()=>{});}
JS
