import fs from 'node:fs/promises';
import {openSync,writeFileSync,unlinkSync,readFileSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';
import {parseArgs} from 'node:util';
import {join,resolve} from 'node:path';
import {createFacebookCommentFetcher} from './facebook_comments.js';
import {createProxyVnRotator} from './proxyvn_rotator.js';

const {values:a}=parseArgs({options:{input:{type:'string'},out:{type:'string'},har:{type:'string'},'key-file':{type:'string'},delay:{type:'string',default:'0'}}});
if(!a.input||!a.out||!a.har||!a['key-file'])throw new Error('Required --input --out --har --key-file');
const delay=Number(a.delay);if(!Number.isFinite(delay)||delay<0)throw new Error('Invalid delay');
const out=resolve(a.out);await fs.mkdir(out,{recursive:true});
const lock=join(out,'collector.lock');
try {writeFileSync(openSync(lock,'wx',0o600),String(process.pid));}
catch(e){if(e.code!=='EEXIST')throw e;try{process.kill(Number(readFileSync(lock,'utf8')),0);throw new Error('Worker already running');}catch(x){if(x.code!=='ESRCH')throw x;}unlinkSync(lock);writeFileSync(openSync(lock,'wx',0o600),String(process.pid));}
process.on('exit',()=>{try{unlinkSync(lock);}catch{}});
const posts=JSON.parse(await fs.readFile(a.input,'utf8'));
let state;
try{state=JSON.parse(await fs.readFile(join(out,'state.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
state??={index:0,totalPosts:posts.length,requests:0,success:0,failed:0,comments:0,replies:0,completedPosts:0,incompletePosts:0,
 proxyRotations:0,queue:[],scheduledParents:[],taskErrors:0,consecutiveFailures:0,startedAt:new Date().toISOString()};
const commentMode='CHRONOLOGICAL_UNFILTERED_INTENT_V1';
if(state.commentMode!==commentMode||state.unfilteredPassVersion!==2){
 const suffix=state.commentMode===commentMode?'before-unfiltered-repair':'before-unfiltered';
 await fs.writeFile(join(out,'state.'+suffix+'.json'),JSON.stringify(state,null,2));
 try{await fs.rename(join(out,'post-status.jsonl'),join(out,'post-status.'+suffix+'.jsonl'));}catch(e){if(e.code!=='ENOENT')throw e;}
 state.previousPass={completedPosts:state.completedPosts,incompletePosts:state.incompletePosts,index:state.index};
 Object.assign(state,{commentMode,unfilteredPassVersion:2,index:0,queue:[],scheduledParents:[],currentSeen:[],taskErrors:0,
  currentComments:0,currentReplies:0,completedPosts:0,incompletePosts:0,consecutiveFailures:0,passStartedAt:new Date().toISOString()});
}
state.stopReason=null;state.pid=process.pid;state.minDelayMs=delay;
let stopping=false,proxy=null,lastRequestAt=0;
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{stopping=true;state.stopReason='INTERRUPTED';});
const acquire=createProxyVnRotator((await fs.readFile(a['key-file'],'utf8')).trim());
const fetch=createFacebookCommentFetcher({harPath:a.har,pageSize:50,commentsIntentToken:commentMode,requireIntentMatch:true});
const seen=new Set();
try{for(const line of (await fs.readFile(join(out,'comments.jsonl'),'utf8')).split('\n').filter(Boolean)){const c=JSON.parse(line);seen.add(c.idPost+':'+c._id);}}
catch(e){if(e.code!=='ENOENT')throw e;await fs.writeFile(join(out,'comments.jsonl'),'');}
async function checkpoint(){state.updatedAt=new Date().toISOString();await fs.writeFile(join(out,'state.json.tmp'),JSON.stringify(state));await fs.rename(join(out,'state.json.tmp'),join(out,'state.json'));}
async function wait(ms){state.retryAt=new Date(Date.now()+ms).toISOString();await checkpoint();for(let n=ms;n>0&&!stopping;n-=1000)await sleep(Math.min(1000,n));}
const fatal=new Set(['AUTH_REQUIRED','SECURITY_CHECKPOINT','REQUEST_TOKEN_INVALID','REQUEST_TEMPLATE_INVALID','INVALID_PROXY','PROXY_API_INVALID_KEY','PROXY_API_NO_ACTIVE_KEY','PROXY_API_BAD_RESPONSE']);
const retry=new Set(['FACEBOOK_RATE_LIMITED','FACEBOOK_ACCESS_DENIED','PROXY_CONNECT_FAILED','PROXY_TIMEOUT','PROXY_TUNNEL_REJECTED','PROXY_AUTH_REQUIRED','NETWORK_ERROR','NETWORK_TIMEOUT','FACEBOOK_SERVER_ERROR','INVALID_RESPONSE']);
await checkpoint();
while(!stopping&&state.index<posts.length){
 const source=posts[state.index];state.activePost=source.id;
 if(!state.queue.length){state.queue=[{idGetComment:source.id,cursor:null,kind:'comment',attempts:0}];state.scheduledParents=[];state.currentSeen=[];state.taskErrors=0;state.currentComments=0;state.currentReplies=0;}
 if(!proxy){
  try{proxy=await acquire();state.proxyRotations++;state.lastError=null;console.log(JSON.stringify({event:'PROXY_READY',rotation:state.proxyRotations}));}
  catch(e){state.lastError={code:e.code??'PROXY_API_ERROR',message:e.message};if(fatal.has(e.code)){state.stopReason=e.code;break;}await wait(Math.max(1000,e.retryAfterMs??60000));continue;}
 }
 const task=state.queue[0];
 const pause=lastRequestAt+delay-Date.now();if(pause>0)await sleep(pause);if(stopping)break;
 state.retryAt=null;lastRequestAt=Date.now();state.requests++;
 try{
  const result=await fetch({idPost:source.id,idGetComment:task.idGetComment,cursor:task.cursor,proxy});
  state.success++;state.consecutiveFailures=0;state.lastError=null;task.attempts=0;
  const scheduled=new Set(state.scheduledParents),currentSeen=new Set(state.currentSeen??[]),added=[];
  const verified=[];
  for(const c of result.comments){
   const key=c.idPost+':'+c._id;
   if(!currentSeen.has(c._id)){currentSeen.add(c._id);verified.push({idPost:c.idPost,_id:c._id,kind:task.kind,commentMode});if(task.kind==='reply')state.currentReplies++;else state.currentComments++;}
   if(!seen.has(key)){seen.add(key);added.push({...c,kind:task.kind,commentMode,siteId:source.siteId,siteName:source.siteName,postUrl:source.link});if(task.kind==='reply')state.replies++;else state.comments++;}
   if((c.repliesCount>0||(c.repliesCount===null&&c.replyCursor))&&!scheduled.has(c._id)){
    scheduled.add(c._id);state.scheduledParents.push(c._id);
    state.queue.push({idGetComment:c._id,cursor:c.replyCursor??null,kind:'reply',attempts:0});
   }
  }
  state.currentSeen=[...currentSeen];
  if(verified.length)await fs.appendFile(join(out,'unfiltered-verified.jsonl'),verified.map(c=>JSON.stringify(c)).join('\n')+'\n');
  if(added.length)await fs.appendFile(join(out,'comments.jsonl'),added.map(c=>JSON.stringify(c)).join('\n')+'\n');
  if(result.alternateCursor)state.queue.push({idGetComment:task.idGetComment,cursor:result.alternateCursor,kind:task.kind,attempts:0});
  if(result.cursor)task.cursor=result.cursor;else state.queue.shift();
  console.log(JSON.stringify({request:state.requests,post:source.id,kind:task.kind,added:added.length,comments:state.comments,replies:state.replies,pending:state.queue.length}));
 }catch(e){
  const code=e.code??'UNEXPECTED_ERROR';state.failed++;state.consecutiveFailures++;state.lastError={code,message:e.message};
  console.log(JSON.stringify({request:state.requests,post:source.id,kind:task.kind,error:code}));
  if(fatal.has(code)){state.stopReason=code;break;}
  if(retry.has(code)){proxy=null;await wait(Math.max(e.retryAfterMs??0,state.consecutiveFailures>=3?300000:5000));continue;}
  if(++task.attempts<3&&['FACEBOOK_GRAPHQL_ERROR','COMMENTS_UNAVAILABLE'].includes(code)){await wait(10000);continue;}
  state.taskErrors++;await fs.appendFile(join(out,'errors.jsonl'),JSON.stringify({post:source.id,parent:task.idGetComment,kind:task.kind,cursor:task.cursor,code,time:new Date().toISOString()})+'\n');state.queue.shift();
 }
 if(!state.queue.length){
  const status=state.taskErrors?'INCOMPLETE':'DONE';
  if(state.taskErrors)state.incompletePosts++;else state.completedPosts++;
  await fs.appendFile(join(out,'post-status.jsonl'),JSON.stringify({post:source.id,status,commentMode,comments:state.currentComments,replies:state.currentReplies,errors:state.taskErrors})+'\n');
  state.index++;state.scheduledParents=[];
 }
 await checkpoint();
}
if(state.index>=posts.length)state.stopReason='ALL_POSTS_FINISHED';
await checkpoint();console.log(JSON.stringify({event:'STOP',reason:state.stopReason,comments:state.comments,replies:state.replies}));
