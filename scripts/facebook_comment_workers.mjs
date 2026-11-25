import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {join} from 'node:path';
const root='/Users/phuctran/Workspace/crawler-2026';
const dir=join(root,'outputs/facebook-comments-september-2026-10-21');
const source=join(root,'outputs/facebook-groups-september-2026-10-21');
const node='/Users/phuctran/.nvm/versions/node/v20.20.1/bin/node';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const mode=process.argv[2];
if(mode==='prepare'){
 try{await fs.access(join(dir,'workers.json'));throw new Error('Already prepared');}catch(e){if(e.code!=='ENOENT')throw e;}
 const posts=(await fs.readFile(join(source,'posts.jsonl'),'utf8')).split('\n').filter(Boolean).map(JSON.parse);
 const prior=await read(join(source,'workers.json'));const workers=[];
 for(let i=0;i<10;i++){
  const out=join(dir,'workers',String(i).padStart(2,'0'));await fs.mkdir(out,{recursive:true});
  const subset=posts.filter((_,j)=>j%10===i);await fs.writeFile(join(out,'posts.json'),JSON.stringify(subset));
  const args=[join(root,'scripts/collect_facebook_comments_bulk.mjs'),'--input',join(out,'posts.json'),'--out',out,
   '--har','/Users/phuctran/Downloads/www.facebook.com.har','--key-file',join(prior.workers[i].out,'proxyvn-key.txt'),'--delay','0'];
  workers.push({id:i,label:`com.codex.facebook-comments-september-2026.worker${i}`,out,program:node,args,posts:subset.length,log:join(out,'run.log')});
 }
 await fs.writeFile(join(dir,'workers.json'),JSON.stringify({totalPosts:posts.length,workers},null,2));
 console.log(JSON.stringify({posts:posts.length,workers:10,minDelayMs:0}));
}
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
async function register(label,program,args,out,log){
 const existing=spawnSync('/bin/launchctl',['list',label],{encoding:'utf8'});if(existing.status===0)throw new Error('Job already registered: '+label);
 const path=join(out,'launch.plist');
 const xml=`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${[program,...args].map(x=>'<string>'+esc(x)+'</string>').join('')}</array><key>RunAtLoad</key><true/><key>KeepAlive</key><false/><key>StandardOutPath</key><string>${esc(log)}</string><key>StandardErrorPath</key><string>${esc(log)}</string></dict></plist>`;
 await fs.writeFile(path,xml);
 const r=spawnSync('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,path],{encoding:'utf8'});if(r.status!==0)throw new Error('launchctl bootstrap failed: '+r.stderr);
}
if(mode==='launch'){
 const registry=await read(join(dir,'workers.json'));
 for(const w of registry.workers){await register(w.label,w.program,w.args,w.out,w.log);console.log(JSON.stringify({worker:w.id,launched:true}));}
 await register('com.codex.facebook-comments-september-2026.summary',node,[join(root,'scripts/facebook_comment_workers.mjs'),'watch'],dir,join(dir,'summary.log'));
}
async function aggregate(){
 const r=await read(join(dir,'workers.json'));const workers=[];
 for(const w of r.workers){try{const s=await read(join(w.out,'state.json'));workers.push({id:w.id,label:w.label,out:w.out,...s});}catch(e){if(e.code!=='ENOENT')throw e;workers.push({id:w.id,label:w.label,out:w.out,pendingStart:true});}}
 const fields=['requests','success','failed','comments','replies','completedPosts','incompletePosts','proxyRotations'];
 const s={totalPosts:r.totalPosts,updatedAt:new Date().toISOString(),minDelayMs:Math.max(...workers.map(w=>w.minDelayMs??0)),
 commentMode:workers.every(w=>w.commentMode==='CHRONOLOGICAL_UNFILTERED_INTENT_V1')?'CHRONOLOGICAL_UNFILTERED_INTENT_V1':'MIXED',
 ...Object.fromEntries(fields.map(k=>[k,workers.reduce((n,w)=>n+(w[k]??0),0)])),workers:workers.map(({queue,scheduledParents,currentSeen,...w})=>({...w,pendingTasks:queue?.length??0}))};
 s.stopReason=workers.every(w=>w.stopReason==='ALL_POSTS_FINISHED')?'ALL_POSTS_FINISHED':null;
 const tmp=join(dir,'state.json.tmp.'+process.pid);await fs.writeFile(tmp,JSON.stringify(s,null,2));await fs.rename(tmp,join(dir,'state.json'));return s;
}
if(mode==='aggregate'){const s=await aggregate();console.log(JSON.stringify({comments:s.comments,replies:s.replies,requests:s.requests,completedPosts:s.completedPosts,incompletePosts:s.incompletePosts}));}
if(mode==='watch')while(true){const s=await aggregate();if(s.stopReason)break;await sleep(15000);}
