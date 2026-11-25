import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),dir=path.resolve(process.env.LOCAL_UID_DIR||path.join(root,'outputs/local-uid-worker-2026-10-29'));
const agents=path.join(os.homedir(),'Library/LaunchAgents'),domain=`gui/${process.getuid()}`;
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const settings=JSON.parse(fs.readFileSync(path.join(dir,'settings.json'),'utf8'));
const concurrency=settings.concurrency;if(!Number.isInteger(concurrency)||concurrency<1||concurrency>100)throw Error('INVALID_UID_CONCURRENCY');
const specs=[['tunnel',path.join(dir,'tunnel.mjs')],['worker',path.join(root,'scripts/local_find_uid_worker.mjs')]];
fs.mkdirSync(agents,{recursive:true});
for(const [name] of specs){let id;try{id=Number(fs.readFileSync(path.join(dir,name+'.pid'),'utf8'));}catch{}if(id){let cmd='';try{cmd=execFileSync('/bin/ps',['-p',String(id),'-o','command='],{encoding:'utf8'});}catch{}if(cmd.includes(name==='worker'?'local_find_uid_worker.mjs':'tunnel.mjs'))throw Error('STOP_UNMANAGED_PROCESS_BEFORE_INSTALL_'+name);}}

for(const [name,script] of specs){
 const label='vn.crawler.local-uid.'+name,args=[process.execPath,...(name==='worker'?['--max-old-space-size=4096']:[]),script];
 const plist=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${args.map(s=>'<string>'+xml(s)+'</string>').join('')}</array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>EnvironmentVariables</key><dict><key>LOCAL_UID_DIR</key><string>${xml(dir)}</string><key>LOCAL_UID_CONCURRENCY</key><string>${concurrency}</string><key>PATH</key><string>${xml(path.dirname(process.execPath))}:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer><key>ExitTimeOut</key><integer>120</integer>
<key>StandardOutPath</key><string>${xml(path.join(dir,name+'.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(dir,name+'.log'))}</string>
</dict></plist>\n`;
 const candidate=path.join(dir,label+'.plist');fs.writeFileSync(candidate,plist,{mode:0o600});execFileSync('/usr/bin/plutil',['-lint',candidate],{stdio:'pipe'});
 const target=path.join(agents,label+'.plist');if(fs.existsSync(target)&&fs.readFileSync(target,'utf8')!==plist)throw Error('EXISTING_SERVICE_DIFFERS_'+name);
 fs.copyFileSync(candidate,target);fs.chmodSync(target,0o600);
 try{execFileSync('/bin/launchctl',['print',domain+'/'+label],{stdio:'pipe'});}catch{execFileSync('/bin/launchctl',['bootstrap',domain,target],{stdio:'pipe'});}
 console.log(JSON.stringify({service:label,installed:true,concurrency:name==='worker'?concurrency:undefined}));
}
