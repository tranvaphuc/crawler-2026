import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
const root=path.resolve(import.meta.dirname,'..'),dir=path.resolve(process.env.LOCAL_UID_DIR||path.join(root,'outputs/local-uid-worker-2026-10-29'));
const domain=`gui/${process.getuid()}`,service=name=>'vn.crawler.local-uid.'+name,plist=name=>path.join(os.homedir(),'Library/LaunchAgents',service(name)+'.plist');
function managed(name){return fs.existsSync(plist(name));}
function loaded(name){try{execFileSync('/bin/launchctl',['print',domain+'/'+service(name)],{stdio:'pipe'});return true;}catch{return false;}}
function startService(name){if(!loaded(name))execFileSync('/bin/launchctl',['bootstrap',domain,plist(name)],{stdio:'pipe'});else if(!running(name))execFileSync('/bin/launchctl',['kickstart',domain+'/'+service(name)],{stdio:'pipe'});}
function audit(action,extra={}){fs.appendFileSync(path.join(dir,'control-audit.jsonl'),JSON.stringify({at:new Date(),action,pid:process.pid,parentPid:process.ppid,...extra})+'\n',{mode:0o600});}
function pid(name){try{return Number(fs.readFileSync(path.join(dir,name+'.pid'),'utf8'));}catch{return null;}}
function running(name){const id=pid(name);if(!id)return false;try{const command=execFileSync('ps',['-p',String(id),'-o','command='],{encoding:'utf8'});return command.includes(name==='worker'?'local_find_uid_worker.mjs':'tunnel.mjs');}catch{return false;}}
function launch(name,script){let settings={};try{settings=JSON.parse(fs.readFileSync(path.join(dir,'settings.json'),'utf8'));}catch{}const fd=fs.openSync(path.join(dir,name+'.log'),'a',0o600),child=spawn(process.execPath,[...(name==='worker'?['--max-old-space-size=4096']:[]),script],{cwd:root,env:{...process.env,LOCAL_UID_DIR:dir,LOCAL_UID_CONCURRENCY:process.env.LOCAL_UID_CONCURRENCY||String(settings.concurrency||5)},detached:true,stdio:['ignore',fd,fd]});child.unref();fs.closeSync(fd);return child.pid;}
const mode=process.argv[2]||'status';
if(mode==='status'){
 console.log(JSON.stringify({managedServices:{worker:managed('worker')&&loaded('worker'),tunnel:managed('tunnel')&&loaded('tunnel')},workerRunning:running('worker'),tunnelRunning:running('tunnel'),workerPid:pid('worker'),tunnelPid:pid('tunnel'),...(fs.existsSync(path.join(dir,'status.json'))?{status:JSON.parse(fs.readFileSync(path.join(dir,'status.json'),'utf8'))}:{})},null,2));
}else if(mode==='scale'){
 const concurrency=Number(process.argv[3]);if(!Number.isInteger(concurrency)||concurrency<1||concurrency>100)throw Error('CONCURRENCY_MUST_BE_1_TO_100');
 audit('scale',{concurrency});const target=path.join(dir,'settings.json');fs.writeFileSync(target+'.tmp',JSON.stringify({concurrency})+'\n',{mode:0o600});fs.renameSync(target+'.tmp',target);console.log(JSON.stringify({requestedConcurrency:concurrency,appliesWithinSeconds:1}));
}else if(mode==='start'){
 audit('start');
 if(!running('tunnel')){if(managed('tunnel'))startService('tunnel');else launch('tunnel',path.join(dir,'tunnel.mjs'));await sleep(5000);}
 if(managed('worker')){startService('worker');console.log(JSON.stringify({managed:true,retryFailed:false}));process.exit(0);}
 if(!running('worker'))console.log(JSON.stringify({workerPid:launch('worker',path.join(root,'scripts/local_find_uid_worker.mjs')),retryFailed:false}));else console.log('Worker is already running.');
}else if(mode==='stop'){
 audit('stop');
 if(managed('worker')&&loaded('worker'))execFileSync('/bin/launchctl',['bootout',domain+'/'+service('worker')],{stdio:'pipe'});
 if(running('worker')){process.kill(pid('worker'),'SIGTERM');for(let i=0;i<60&&running('worker');i++)await sleep(1000);if(running('worker'))throw Error('WORKER_STILL_DRAINING_TUNNEL_LEFT_OPEN');}
 if(managed('tunnel')&&loaded('tunnel'))execFileSync('/bin/launchctl',['bootout',domain+'/'+service('tunnel')],{stdio:'pipe'});
 if(running('tunnel'))process.kill(pid('tunnel'),'SIGTERM');console.log('Local UID worker and tunnel stopped.');
}else throw Error('Use start | stop | status | scale <concurrency>');
