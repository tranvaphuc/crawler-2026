import fs from 'node:fs/promises';import {randomBytes} from 'node:crypto';import dotenv from 'dotenv';import {MongoClient} from 'mongodb';
const admin=dotenv.parse(await fs.readFile('/etc/crawler-v8/mongo-admin.env'));const root=new MongoClient(`mongodb://${encodeURIComponent(admin.MONGO_INITDB_ROOT_USERNAME)}:${encodeURIComponent(admin.MONGO_INITDB_ROOT_PASSWORD)}@127.0.0.1:27017/admin`);await root.connect();
let existing={};try{existing=dotenv.parse(await fs.readFile('/etc/crawler-v8/runtime.env'))}catch{}
const pass=existing.CRAWL_MONGO_PASSWORD||randomBytes(32).toString('hex'),db=root.db('crawler_v8');
const users=await db.command({usersInfo:'crawler_worker'});if(!users.users.length)await db.command({createUser:'crawler_worker',pwd:pass,roles:[{role:'readWrite',db:'crawler_v8'}]});
const api=dotenv.parse(await fs.readFile('/etc/crawler-api/runtime.env'));const config={...api,CRAWL_MONGO_PASSWORD:pass,CRAWL_MONGO_URI:`mongodb://crawler_worker:${encodeURIComponent(pass)}@127.0.0.1:27017/crawler_v8?authSource=crawler_v8`,CRAWL_DATA_DIR:'/var/lib/crawler-v8',CRAWL_RUN_ID:'october-2026-v8',CRAWL_MAX_CONCURRENCY:'120',SOCIAL_PLATFORM_COOLDOWN_FILE:'/var/lib/crawler-v8/platform-cooldowns.json',PROXY_MANAGER_URL:'http://127.0.0.1:3810'};
await fs.writeFile('/etc/crawler-v8/runtime.env',Object.entries(config).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n',{mode:0o600});await root.close();
console.log(JSON.stringify({mongoDatabase:'crawler_v8',workerRole:'readWrite:crawler_v8',auth:true,bind:'127.0.0.1:27017',credentialsOmitted:true}));
