import 'dotenv/config';import fs from 'node:fs';import {createProxyManager} from '../src/services/proxyManager.js';import {createProxyManagerApp} from '../src/routes/proxyManagerApp.js';
const host=process.env.PROXY_MANAGER_HOST||'127.0.0.1';if(!['127.0.0.1','::1'].includes(host))throw Error('PROXY_MANAGER_HOST must be loopback; expose remotely only through an authenticated TLS reverse proxy');
const manager=createProxyManager({keysFile:process.env.PROXY_MANAGER_KEYS_FILE,stateFile:process.env.PROXY_MANAGER_STATE_FILE,settingsFile:process.env.PROXY_MANAGER_SETTINGS_FILE,groupCommitMs:Number(process.env.PROXY_MANAGER_GROUP_COMMIT_MS||0)});
// Preserve outstanding limits from the previous deployment; they expire naturally.
if(process.env.SOCIAL_PLATFORM_COOLDOWN_FILE&&fs.existsSync(process.env.SOCIAL_PLATFORM_COOLDOWN_FILE)){const old=JSON.parse(fs.readFileSync(process.env.SOCIAL_PLATFORM_COOLDOWN_FILE));manager.importCooldowns(Object.fromEntries(Object.entries(old).map(([p,t])=>[p.includes('.')?p:p+'.*',t])));}
if(!process.env.PROXY_MANAGER_ADMIN_KEY)throw Error('PROXY_MANAGER_ADMIN_KEY is required');
const app=createProxyManagerApp({manager,key:process.env.PROXY_MANAGER_AUTH_KEY,adminKey:process.env.PROXY_MANAGER_ADMIN_KEY,backgroundKey:process.env.PROXY_MANAGER_BACKGROUND_AUTH_KEY});const server=app.listen(Number(process.env.PROXY_MANAGER_PORT||3810),host,()=>console.log('Authenticated proxy manager listening on loopback'));
server.requestTimeout=45000;server.headersTimeout=10000;
let ticking=false;const timer=setInterval(async()=>{if(ticking)return;ticking=true;try{await manager.tick();await manager.flush?.();}catch{}finally{ticking=false;}},1000);timer.unref();
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{clearInterval(timer);manager.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
