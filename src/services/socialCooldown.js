import fs from 'node:fs';
import path from 'node:path';
import {validProxyScope} from './proxyScope.js';
const platforms=['facebook','threads','instagram','youtube'];
/** Optional durable state preserves upstream limits across deploys/process restarts. */
export function createPlatformCooldownStore({file=()=>process.env.SOCIAL_PLATFORM_COOLDOWN_FILE,now=Date.now}={}){
 const deadlines=new Map();
 const location=()=>typeof file==='function'?file():file;
 function mergeDisk(){const name=location();if(!name)return;let data;try{data=JSON.parse(fs.readFileSync(name,'utf8'));}catch(e){if(e.code==='ENOENT')return;throw Object.assign(Error('COOLDOWN_STATE_UNAVAILABLE'),{code:'COOLDOWN_STATE_UNAVAILABLE'});}
  for(const [p,t]of Object.entries(data))if((platforms.includes(p)||validProxyScope(p))&&Number.isFinite(t)&&t>now())deadlines.set(p,Math.max(deadlines.get(p)||0,t));
 }
 return{
  wait(platform,time=now()){mergeDisk();return Math.max(0,Math.max(deadlines.get(platform)||0,deadlines.get(platform.split('.')[0])||0)-time);},
  defer(platform,ms,time=now()){
   mergeDisk();if(!platforms.includes(platform)&&!validProxyScope(platform))return;
   const duration=Number.isFinite(ms)&&ms>0?ms:900000;deadlines.set(platform,Math.max(deadlines.get(platform)||0,time+duration));
   const name=location();if(name){const data=Object.fromEntries([...deadlines].filter(([,until])=>until>time));fs.mkdirSync(path.dirname(name),{recursive:true,mode:0o700});const tmp=name+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data)+'\n',{mode:0o600});fs.renameSync(tmp,name);}
  }
 };
}
const shared=createPlatformCooldownStore();
export function platformWait(platform,now=Date.now()){return shared.wait(platform,now);}
export function deferPlatform(platform,ms,now=Date.now()){shared.defer(platform,ms,now);}
