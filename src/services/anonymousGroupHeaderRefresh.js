import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const GROUP_FEED_QUERY='GroupsCometFeedRegularStoriesPaginationQuery';
export const DEFAULT_ANONYMOUS_GROUP='441457417533168';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>Object.assign(new Error(code),{code});
const blockedHeaders=new Set(['authorization','proxy-authorization','cookie','host','content-length','accept-encoding','connection','x-fb-lsd','x-fb-navigation-chain','x-fb-entry-nonce']);
export function prepareAnonymousGroupTemplate(input,{now=Date.now(),groupId=DEFAULT_ANONYMOUS_GROUP,maxAgeMs=900000}={}){
 if(!input||input.version!==1||!/^\d+$/.test(groupId))throw fail('CANDIDATE_INVALID');
 const at=Date.parse(input.capturedAt);if(!Number.isFinite(at)||at>now+120000||now-at>maxAgeMs)throw fail('CANDIDATE_EXPIRED');
 const target=`https://www.facebook.com/groups/${groupId}`;
 if(input.sourceUrl!==target)throw fail('CANDIDATE_TARGET_MISMATCH');
 const r=input.request;if(!r||r.url!=='https://www.facebook.com/api/graphql/'||r.method!=='POST'||typeof r.body!=='string'||Buffer.byteLength(r.body)>350000)throw fail('CANDIDATE_REQUEST_INVALID');
 const form=Object.fromEntries(new URLSearchParams(r.body));
 if(form.__user!=='0'||form.av!=='0'||form.access_token||form.fb_dtsg)throw fail('AUTHENTICATED_CONTEXT_REFUSED');
 if(form.fb_api_req_friendly_name!==GROUP_FEED_QUERY||!/^\d{1,32}$/.test(form.doc_id||''))throw fail('CANDIDATE_QUERY_INVALID');
 let variables;try{variables=JSON.parse(form.variables)}catch{throw fail('CANDIDATE_VARIABLES_INVALID')}
 if(!variables||Array.isArray(variables)||String(variables.id)!==groupId)throw fail('CANDIDATE_TARGET_MISMATCH');
 const headers=[];if(!r.headers||typeof r.headers!=='object'||Array.isArray(r.headers)||Object.keys(r.headers).length>100)throw fail('CANDIDATE_HEADERS_INVALID');
 const seen=new Set();for(const [raw,value]of Object.entries(r.headers)){
  const name=raw.toLowerCase();if(!/^[a-z0-9!#$%&'*+.^_`|~-]{1,100}$/.test(name)||typeof value!=='string'||/[\r\n\0]/.test(value)||value.length>20000||seen.has(name))throw fail('CANDIDATE_HEADERS_INVALID');seen.add(name);
  if(name==='authorization'||name==='proxy-authorization'||name==='cookie'&&/(?:^|;)\s*(?:c_user|xs)\s*=/i.test(value))throw fail('AUTHENTICATED_CONTEXT_REFUSED');
  if(!blockedHeaders.has(name)&&!name.startsWith(':'))headers.push({name,value});
 }
 // The worker obtains anonymous CSRF/cookies from its own proxy session.
 // Retain the native operation/provider schema, never a shared browser token.
 for(const key of ['fb_dtsg','access_token','__s','jazoest'])delete form[key];
 form.lsd='ANONYMOUS_BOOTSTRAP_REQUIRED';
 return {capturedAt:new Date(at).toISOString(),groupId,entry:{request:{url:r.url,method:'POST',headers,postData:{mimeType:'application/x-www-form-urlencoded',text:new URLSearchParams(form).toString()}}}};
}
export function mergeAnonymousGroupTemplate(current,candidate){
 if(!current||!Array.isArray(current.log?.entries))throw fail('CURRENT_TEMPLATE_INVALID');
 const prior=current.log.entries.filter(e=>new URLSearchParams(e.request?.postData?.text||'').get('fb_api_req_friendly_name')===GROUP_FEED_QUERY).at(-1);
 const entry=structuredClone(candidate.entry);
 try{const oldForm=new URLSearchParams(prior?.request?.postData?.text||''),nextForm=new URLSearchParams(entry.request.postData.text),oldVars=JSON.parse(oldForm.get('variables')),nextVars=JSON.parse(nextForm.get('variables'));
  // Preserve established batching where the captured operation exposes it.
  // Native provider flags and the operation id always come from the capture.
  for(const key of ['count','stream_initial_count'])if(Object.hasOwn(nextVars,key)&&Number.isInteger(oldVars?.[key])&&oldVars[key]>=0&&oldVars[key]<=100)nextVars[key]=oldVars[key];
  nextForm.set('variables',JSON.stringify(nextVars));entry.request.postData.text=nextForm.toString();
 }catch{}
 const entries=current.log.entries.filter(e=>new URLSearchParams(e.request?.postData?.text||'').get('fb_api_req_friendly_name')!==GROUP_FEED_QUERY);
 return {...current,log:{...current.log,entries:[...entries,entry]}};
}
function atomicWrite(file,bytes,{mode=0o600,uid,gid}={}){
 const temp=path.join(path.dirname(file),'.'+path.basename(file)+'.refresh-'+randomUUID());let fd;
 try{fd=fs.openSync(temp,'wx',mode);fs.writeFileSync(fd,bytes);if(Number.isInteger(uid)&&Number.isInteger(gid))fs.fchownSync(fd,uid,gid);fs.fchmodSync(fd,mode);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temp,file);}finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(temp)}catch(e){if(e.code!=='ENOENT')throw e}}
}
export async function refreshAnonymousGroupTemplate({input,activeFile,historyDir,validate,now=Date.now(),commit=atomicWrite}){
 const candidate=prepareAnonymousGroupTemplate(input,{now}),real=fs.realpathSync(activeFile),stat=fs.statSync(real),old=fs.readFileSync(real),before=sha256(old);
 const merged=mergeAnonymousGroupTemplate(JSON.parse(old),candidate),bytes=Buffer.from(JSON.stringify(merged,null,2)+'\n');
 fs.mkdirSync(historyDir,{recursive:true,mode:0o700});const dir=fs.mkdtempSync(path.join(historyDir,'validation-'));fs.chmodSync(dir,0o700);const candidateFile=path.join(dir,'candidate.private.json');fs.writeFileSync(candidateFile,bytes,{mode:0o600});
 try{
  let proof;try{proof=await validate({candidateFile,candidate})}catch(error){return{status:'kept_current',reason:'validation_failed',code:/^[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:'VALIDATION_FAILED',activeHash:before}}
  if(!proof?.ok||proof.groupId!==candidate.groupId||!Number.isInteger(proof.posts)||proof.posts<1||proof.checkpointCompatible!==true)return{status:'kept_current',reason:'validation_failed',activeHash:before};
  if(fs.realpathSync(activeFile)!==real||sha256(fs.readFileSync(real))!==before)return{status:'kept_current',reason:'active_template_changed'};
  const after=sha256(bytes),backupFile=path.join(historyDir,'before-'+now+'-'+before.slice(0,12)+'.private.json');fs.writeFileSync(backupFile,old,{mode:0o600,flag:'wx'});
  commit(real,bytes,{mode:stat.mode&0o777,uid:stat.uid,gid:stat.gid});
  return{status:'updated',capturedAt:candidate.capturedAt,verifiedAt:new Date().toISOString(),groupId:candidate.groupId,posts:proof.posts,checkpointChecked:proof.checkpointChecked===true,activeHash:after,previousHash:before};
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
