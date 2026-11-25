import 'dotenv/config';
import {createHash,timingSafeEqual} from 'node:crypto';
import express from 'express';
import {MongoClient} from 'mongodb';
import Redis from 'ioredis';
import {Queue} from 'bullmq';
import {createBullBoard} from '@bull-board/api';
import {BullMQAdapter} from '@bull-board/api/bullMQAdapter.js';
import {ExpressAdapter} from '@bull-board/express';
import {FLOW_QUEUES,queueName,FLOW_POLICY} from '../src/services/crawlerQueueFlow.js';
import {createQueueMutationAudit} from '../src/services/queueMutationAudit.js';
import {startQueueMutationObserver} from '../src/services/queueMutationObserver.js';

const username=process.env.QUEUE_BOARD_USER||'admin', password=process.env.QUEUE_BOARD_PASSWORD;
if(!password||password.length<24)throw Error('QUEUE_BOARD_PASSWORD_REQUIRED');
const runId=process.env.CRAWL_RUN_ID||'october-2026-v8';
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{maxPoolSize:10,serverSelectionTimeoutMS:10000});
await mongo.connect();const jobs=mongo.db().collection('flow_jobs');
const redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:null});
const queues=FLOW_QUEUES.map(q=>({spec:q,queue:new Queue(queueName(q.name),{connection:redis})}));
await Promise.all(queues.map(q=>q.queue.waitUntilReady()));
const app=express();app.disable('x-powered-by');app.set('trust proxy','loopback');
const equal=(a,b)=>{const x=createHash('sha256').update(a).digest(),y=createHash('sha256').update(b).digest();return timingSafeEqual(x,y);};
app.use((req,res,next)=>{
 res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"});
 const header=req.headers.authorization||'';const match=/^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(header);
 let user='',pass='';if(match){try{[user,pass]=Buffer.from(match[1],'base64').toString().split(/:(.*)/s).slice(0,2);}catch{}}
 if(!equal(user,username)||!equal(pass,password))return res.status(401).set('WWW-Authenticate','Basic realm="Crawler v8 queue"').end('Authentication required');
 req.queueBoardActor=username;
 next();
});
const mutationAudit=mongo.db().collection('flow_queue_mutation_audit');
await mutationAudit.createIndex({at:1,queue:1});
app.use(createQueueMutationAudit({collection:mutationAudit,queueNames:new Set(queues.map(q=>q.queue.name)),log:(event,data)=>console.log(JSON.stringify({at:new Date(),event,...data}))}));
const mutationEvents=mongo.db().collection('flow_queue_mutation_events');
await mutationEvents.createIndex({at:1,queue:1});
const observer=await startQueueMutationObserver({names:queues.map(q=>q.queue.name),connection:redis,collection:mutationEvents,positions:mongo.db().collection('flow_queue_mutation_positions'),log:(event,data)=>console.log(JSON.stringify({at:new Date(),event,...data}))});

app.get('/api/summary',async(req,res)=>{
 try{res.json({at:new Date(),policy:FLOW_POLICY,queues:await Promise.all(queues.map(async({spec,queue})=>({...spec,...await queue.getJobCounts('waiting','active','delayed','completed','failed','paused')}))),mongo:await jobs.aggregate([{$group:{_id:{queue:'$queue',state:'$state'},count:{$sum:1}}}]).toArray()});}
 catch{res.status(503).json({error:'QUEUE_STATUS_UNAVAILABLE'});}
});
const board=new ExpressAdapter();board.setBasePath('/bull');
createBullBoard({queues:queues.map(({queue})=>new BullMQAdapter(queue,{readOnlyMode:false,allowRetries:true})),serverAdapter:board});
app.use('/bull',board.getRouter());
app.get('/',(_,res)=>res.redirect('/bull'));
const server=app.listen(Number(process.env.QUEUE_BOARD_PORT||3806),'127.0.0.1');
let closing=false;
async function close(){if(closing)return;closing=true;await new Promise(resolve=>server.close(resolve));await observer.close();await Promise.all(queues.map(q=>q.queue.close()));await redis.quit();await mongo.close();}
process.on('SIGTERM',close);process.on('SIGINT',close);
