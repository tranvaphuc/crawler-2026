import fs from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {createFacebookSourceResolver,normalizeFacebookSource} from './facebook_source_resolver.mjs';
const {values:args}=parseArgs({options:{input:{type:'string'},out:{type:'string'},har:{type:'string'},concurrency:{type:'string'}}});
const root=args.out??'outputs/project-sources-2026-10-21';await fs.mkdir(root,{recursive:true});
const input=JSON.parse(await fs.readFile(args.input??root+'/facebook-targets.json','utf8'));
const targetMap=new Map();for(const x of input){const s=typeof x==='string'?normalizeFacebookSource(x):x.key?x:{...x,...normalizeFacebookSource(x.url??x.inputUrl)};if(s.status==='SOURCE')targetMap.set(s.key,s);}
const targets=[...targetMap.values()];
const concurrency=Number(args.concurrency??process.env.SOURCE_CONCURRENCY??10),batchSize=10;
if(!Number.isInteger(concurrency)||concurrency<1||concurrency>50)throw new Error('concurrency must be 1..50');
const resolver=await createFacebookSourceResolver({harPath:args.har??process.env.FACEBOOK_SOURCE_HAR??'/Users/phuctran/Downloads/www.facebook.com_findIdPAge.har'});
const results=new Map();
try{for(const line of(await fs.readFile(root+'/facebook-resolved.jsonl','utf8')).split('\n').filter(Boolean)){const x=JSON.parse(line);results.set(x.key,x);}}catch(e){if(e.code!=='ENOENT')throw e;}
let routeCalls=0,profileCalls=0,errors=0,stopping=false;
process.on('SIGTERM',()=>stopping=true);process.on('SIGINT',()=>stopping=true);
async function save(s){results.set(s.key,s);await fs.appendFile(root+'/facebook-resolved.jsonl',JSON.stringify({...s,resolvedAt:new Date().toISOString()})+'\n');}
async function state(phase){await fs.writeFile(root+'/resolve-state.json',JSON.stringify({phase,targets:targets.length,resolved:results.size,verified:[...results.values()].filter(x=>x.status==='RESOLVED').length,routeCalls,profileCalls,errors,updatedAt:new Date().toISOString()}));}
const queue=[];const pending=targets.filter(x=>!results.has(x.key)||process.env.RETRY_ROUTES==='1'&&['ROUTE_UNAVAILABLE','PROFILE_QUERY_ERROR','PROFILE_ID_ONLY','SOURCE_UNAVAILABLE'].includes(results.get(x.key).status)||process.env.RETRY_MISSING_ROUTES==='1'&&['ROUTE_UNAVAILABLE','FACEBOOK_HTTP_502','NETWORK_ERROR','NETWORK_TIMEOUT'].includes(results.get(x.key)?.status));for(let i=0;i<pending.length;i+=batchSize)queue.push(pending.slice(i,i+batchSize));
async function routeWorker(){while(queue.length&&!stopping){const batch=queue.shift();routeCalls++;try{for(const s of await resolver.resolveRoutes(batch))await save(s);}catch(e){errors++;for(const s of batch)await save({...s,id:null,profileId:null,type:s.typeHint==='group'?'group':null,name:null,status:e.code??'NETWORK_ERROR'});if(e.code==='FACEBOOK_RATE_LIMITED')stopping=true;}await state('routes');}}
await Promise.all(Array.from({length:concurrency},routeWorker));
console.log(JSON.stringify({phase:'routes_done',targets:targets.length,routeCalls,errors}));
const profileQueue=[...results.values()].filter(x=>x.status==='PROFILE_ID_ONLY'&&x.profileId);
async function profileWorker(){while(profileQueue.length&&!stopping){const s=profileQueue.shift();profileCalls++;try{await save(await resolver.resolveProfile(s));}catch(e){errors++;await save({...s,status:e.code??'NETWORK_ERROR'});if(e.code==='FACEBOOK_RATE_LIMITED')stopping=true;}if(profileCalls%100===0)console.log(JSON.stringify({phase:'profiles',calls:profileCalls,pending:profileQueue.length,errors}));if(profileCalls%20===0)await state('profiles');}}
await Promise.all(Array.from({length:concurrency},profileWorker));
await state(stopping?'STOPPED':'FINISHED');
await fs.writeFile(root+'/facebook-resolved.json',JSON.stringify([...results.values()],null,2));
console.log(JSON.stringify({phase:stopping?'STOPPED':'FINISHED',routeCalls,profileCalls,errors,statuses:[...results.values()].reduce((a,x)=>(a[x.status]=(a[x.status]??0)+1,a),{})}));
