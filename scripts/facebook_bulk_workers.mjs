import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

const root='/Users/phuctran/Workspace/crawler-2026';
const dir=join(root,'outputs/facebook-groups-september-2026-10-21');
const registryPath=join(dir,'workers.json');
const command=process.argv[2];
const node='/Users/phuctran/.nvm/versions/node/v20.20.1/bin/node';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
async function atomic(path,data) {const tmp=path+'.tmp.'+process.pid;await fs.writeFile(tmp,JSON.stringify(data,null,2));await fs.rename(tmp,path);}
function launch(args) {
  const r=spawnSync('/bin/launchctl',args,{encoding:'utf8'});
  if(r.status!==0) throw new Error(`launchctl ${args[0]} failed: ${(r.stderr??'').slice(0,300)}`);
  return r.stdout;
}

if(command==='prepare') {
  const old=await read(join(dir,'state.json'));
  try {process.kill(old.pid,0);throw new Error('Original collector is still running');}
  catch(e){if(e.code!=='ESRCH')throw e;}
  try {await fs.access(registryPath);throw new Error('Worker registry already exists');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  const keys=[(await fs.readFile(join(dir,'proxyvn-key.txt'),'utf8')).trim(),...(await fs.readFile(join(dir,'additional-proxy-keys.txt'),'utf8')).trim().split(/\s+/)];
  if(keys.length!==10||new Set(keys).size!==10) throw new Error('Expected ten distinct proxy keys');
  const oldRows=(await fs.readFile(join(dir,'posts.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  await fs.copyFile(join(dir,'state.json'),join(dir,'state.before-workers.json'));
  await fs.copyFile(join(dir,'posts.jsonl'),join(dir,'posts.before-workers.jsonl'));
  const shards=Array.from({length:10},()=>[]);
  // Keep every already-visited group and its cursor on the original worker.
  let next=1;
  for(const g of old.groups) {
    if(g.status!=='PENDING'||g.pages||g.posts) shards[0].push(g);
    else {shards[next].push(g);next=(next+1)%10;}
  }
  const assigned=shards.flat().map(g=>g.siteId);
  if(assigned.length!==old.groups.length||new Set(assigned).size!==assigned.length)throw new Error('Invalid group partition');
  const workers=[];
  for(let i=0;i<10;i++) {
    const out=join(dir,'workers',String(i).padStart(2,'0'));await fs.mkdir(out,{recursive:true});
    await fs.writeFile(join(out,'proxyvn-key.txt'),keys[i]+'\n',{mode:0o600});
    await fs.writeFile(join(out,'group-ids.json'),JSON.stringify(shards[i].map(g=>g.siteId)));
    const ids=new Set(shards[i].map(g=>g.siteId));
    const posts=oldRows.filter(r=>ids.has(r.siteId));
    await fs.writeFile(join(out,'posts.jsonl'),posts.map(r=>JSON.stringify(r)).join('\n')+(posts.length?'\n':''));
    const state={...old,totalGroups:shards[i].length,groups:shards[i],totalPosts:posts.length,
      requests:i===0?old.requests:0,metrics:i===0?old.metrics:undefined,pid:null,activeGroup:null,
      stopReason:null,retryAt:null,lastError:null};
    await atomic(join(out,'state.json'),state);
    const label=i===0?'com.codex.facebook-september-2026':`com.codex.facebook-september-2026.worker${i}`;
    const args=[join(root,'scripts/collect_group_posts_bulk.mjs'),'--input',join(out,'group-ids.json'),
      '--har','/Users/phuctran/Downloads/www.facebook.com.har','--out',out,'--month','2026-09',
      '--delay','2000','--proxy-key-file',join(out,'proxyvn-key.txt')];
    workers.push({id:i,label,out,groupCount:shards[i].length,program:node,args,log:join(out,'run.log')});
  }
  await atomic(registryPath,{createdAt:new Date().toISOString(),originalIds:old.groups.map(g=>g.siteId),workers});
  console.log(JSON.stringify({workers:10,groupCounts:shards.map(g=>g.length),preservedPosts:oldRows.length}));
}

async function aggregate() {
  const registry=await read(registryPath);
  const states=await Promise.all(registry.workers.map(async w=>({...w,state:await read(join(w.out,'state.json'))})));
  const groupMap=new Map(states.flatMap(w=>w.state.groups).map(g=>[g.siteId,g]));
  if(groupMap.size!==registry.originalIds.length)throw new Error('Missing/duplicate group in aggregate');
  const posts=new Map();
  for(const w of states) for(const line of (await fs.readFile(join(w.out,'posts.jsonl'),'utf8')).split('\n').filter(Boolean)) {
    const r=JSON.parse(line);posts.set(r.siteId+':'+r.id,r);
  }
  const metricKeys=['successfulRequests','failedRequests','proxyRotations','proxyApiCalls','blockedRequests'];
  const metrics=Object.fromEntries(metricKeys.map(k=>[k,states.reduce((n,w)=>n+(w.state.metrics?.[k]??0),0)]));
  const groups=registry.originalIds.map(id=>groupMap.get(id));
  const allDone=states.every(w=>w.state.stopReason==='ALL_GROUPS_FINISHED');
  const summary={month:'2026-09',timezone:'Asia/Ho_Chi_Minh',typenameSource:'feedback.owning_profile.__typename',
    mode:'parallel-workers',targetPerGroup:1000,totalGroups:groups.length,
    requests:states.reduce((n,w)=>n+w.state.requests,0),totalPosts:posts.size,metrics,
    updatedAt:new Date().toISOString(),stopReason:allDone?'ALL_GROUPS_FINISHED':null,
    workers:states.map(w=>({id:w.id,label:w.label,out:w.out,pid:w.state.pid,
      activeGroup:w.state.activeGroup,requests:w.state.requests,totalPosts:w.state.totalPosts,
      stopReason:w.state.stopReason,lastError:w.state.lastError,retryAt:w.state.retryAt,updatedAt:w.state.updatedAt})),groups};
  const tmpPosts=join(dir,'posts.jsonl.tmp.'+process.pid);
  await fs.writeFile(tmpPosts,[...posts.values()].map(r=>JSON.stringify(r)).join('\n')+(posts.size?'\n':''));
  await fs.rename(tmpPosts,join(dir,'posts.jsonl'));
  await atomic(join(dir,'state.json'),summary);
  return summary;
}

if(command==='launch') {
  const registry=await read(registryPath);
  // The original job is stopped before replacing its arguments with worker 0.
  for(const w of registry.workers) {
    const existing=spawnSync('/bin/launchctl',['list',w.label],{encoding:'utf8'});
    if(existing.status===0) {
      if(/"PID"\s*=\s*\d+/.test(existing.stdout))throw new Error(`Job ${w.id} already running`);
      launch(['remove',w.label]);
    }
    launch(['submit','-l',w.label,'-o',w.log,'-e',w.log,'--',w.program,...w.args]);
    console.log(JSON.stringify({worker:w.id,launched:true,groups:w.groupCount}));
  }
  const label='com.codex.facebook-september-2026.summary';
  const existing=spawnSync('/bin/launchctl',['list',label],{encoding:'utf8'});
  if(existing.status!==0)launch(['submit','-l',label,'-o',join(dir,'summary.log'),'-e',join(dir,'summary.log'),'--',node,join(root,'scripts/facebook_bulk_workers.mjs'),'watch']);
}
if(command==='aggregate')console.log(JSON.stringify({posts:(await aggregate()).totalPosts}));
if(command==='watch') {
  while(true) {const s=await aggregate();if(s.stopReason==='ALL_GROUPS_FINISHED')break;await sleep(15000);}
}
if(!['prepare','launch','aggregate','watch'].includes(command))throw new Error('Use prepare, launch, aggregate or watch');
