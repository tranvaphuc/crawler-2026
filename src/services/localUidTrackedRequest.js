import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

// Pin the exact config used by curl. A concurrent account refresh cannot
// attribute this response to the replacement account. Secrets never enter argv.
export async function trackedUidRequest({dir,configFile=path.join(dir,'curl.credentials.conf'),url,routeForm,usage,purpose='worker_lookup',concurrency,spawnImpl=spawn,onTelemetryError=error=>{throw error;}}={}){
 const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='www.facebook.com')throw Error('INVALID_FACEBOOK_PROFILE_URL');
 if(routeForm&&u.pathname!=='/ajax/bulk-route-definitions/')throw Error('INVALID_UID_ROUTE_ENDPOINT');
 const config=fs.readFileSync(configFile,'utf8'),temp=fs.mkdtempSync(path.join(dir,'.uid-request-')),pinned=path.join(temp,'curl.credentials.conf'),started=Date.now();
 let ref,curlExit=null,httpStatus=0,numRedirects=0,sizeRequest=0,accountingAvailable=false,noRequestPossible=false;
 try{
  let requestConfig=config;
  if(routeForm){
   requestConfig=config.split('\n').filter(line=>{const m=line.match(/^\s*header\s*=\s*(".*")\s*$/);return !m||! /^(?:accept|content-type|origin|referer|sec-fetch-\w+|upgrade-insecure-requests):/i.test(JSON.parse(m[1]));}).join('\n');
   for(const header of ['accept: */*','content-type: application/x-www-form-urlencoded','origin: https://www.facebook.com','referer: https://www.facebook.com/','sec-fetch-site: same-origin','sec-fetch-mode: cors','sec-fetch-dest: empty'])requestConfig+='\nheader = '+JSON.stringify(header);
   requestConfig+='\ndata = '+JSON.stringify(new URLSearchParams(routeForm).toString())+'\n';
  }
  fs.chmodSync(temp,0o700);fs.writeFileSync(pinned,requestConfig,{mode:0o600});ref=usage.start(config,{purpose,target:url,concurrency});
  const output=await new Promise((resolve,reject)=>{
   const child=spawnImpl('/usr/bin/curl',['--config',pinned,'--compressed','--silent','--show-error','--location','--proto','=https','--proto-redir','=https','--max-redirs','5','--connect-timeout','15','--max-time','45','--max-filesize','20000000','--write-out','\n%{http_code}\n%{num_redirects}\n%{size_request}\n%{url_effective}',url],{stdio:['ignore','pipe','pipe']});
   const chunks=[];let size=0,tooLarge=false;child.stdout.on('data',chunk=>{size+=chunk.length;if(size>24*1024*1024){tooLarge=true;child.kill();}else chunks.push(chunk);});child.stderr.resume();
   child.on('error',()=>{noRequestPossible=true;reject(Error('LOCAL_CURL_SPAWN_FAILED'));});child.on('close',code=>{curlExit=code;if(tooLarge)return reject(Error('FACEBOOK_PROFILE_TOO_LARGE'));resolve(Buffer.concat(chunks).toString('utf8'));});
  });
  const lines=output.split('\n'),finalUrl=lines.pop(),bytes=lines.pop(),redirects=lines.pop(),status=lines.pop();accountingAvailable=/^\d{3}$/.test(status||'')&&/^\d+$/.test(redirects||'')&&/^\d+$/.test(bytes||'');sizeRequest=Number(bytes)||0;numRedirects=Number(redirects)||0;httpStatus=Number(status)||0;
  if(curlExit!==0)throw Error('LOCAL_CURL_EXIT_'+curlExit);
  if(!/^https:\/\/(?:www\.|m\.|web\.)?facebook\.com\//.test(finalUrl))throw Error('FACEBOOK_PROFILE_REDIRECT_INVALID');
  return{html:lines.join('\n'),httpStatus,finalUrl,uidUsageRef:ref};
 }finally{fs.rmSync(temp,{recursive:true,force:true});if(ref)try{usage.finish(ref,{httpStatus,numRedirects,sizeRequest,curlExit,durationMs:Date.now()-started,accountingAvailable,noRequestPossible});}catch(error){onTelemetryError(error);}}
}
