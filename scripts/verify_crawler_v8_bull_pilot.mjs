import Redis from 'ioredis';
import {Queue,Worker} from 'bullmq';
import {seedCrawlerV8BullQueue} from '../src/services/crawlerV8BullQueue.js';

const connection=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:null});
const queueName='crawler-v8-migration-pilot';
const queue=new Queue(queueName,{connection});
await queue.obliterate({force:true});
let counter=0;
const collection={find(query){return{sort(){return this},limit(){return this},async toArray(){return[{
 _id:`pilot-${++counter}`,kind:query.kind,platform:query.platform,
 sourceId:query.sourceId?`facebook:${query.kind==='source'?'page':'group'}:pilot`:`${query.platform}:pilot`,
 state:'pending',nextAt:new Date(),attempts:0,createdAt:new Date()
}];}}}};
const seeded=await seedCrawlerV8BullQueue({collection,queue,runId:'pilot'});
let processed=0;
const worker=new Worker(queueName,async()=>{processed++;return{ok:true}},{connection,concurrency:12});
const deadline=Date.now()+10000;
while(processed<12&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
const counts=await queue.getJobCounts('waiting','active','completed','failed');
await worker.close();await queue.obliterate({force:true});await queue.close();await connection.quit();
if(seeded.offered!==12||processed!==12||counts.failed!==0)throw Error('BULL_PILOT_FAILED');
console.log(JSON.stringify({pilot:'passed',channels:12,seeded:seeded.offered,processed,failed:counts.failed}));
