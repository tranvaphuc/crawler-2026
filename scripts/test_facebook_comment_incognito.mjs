/** Development diagnostic only. Runtime APIs never launch Chrome.
 * FB_TEST_URL=<public Facebook post URL> node scripts/test_facebook_comment_incognito.mjs
 * Requires the configured proxy manager and an SSH relay when the provider blocks local ingress.
 * Reports contain no cookies, headers, tokens or proxy credentials.
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createProxyManagerClient} from '../src/services/proxyManagerClient.js';
const run=promisify(execFile),url=process.env.FB_TEST_URL||'https://www.facebook.com/groups/congdongisocialcom/permalink/3615941351894944/';
const parsed=new URL(url);if(!/(^|\.)facebook\.com$/.test(parsed.hostname))throw Error('FACEBOOK_URL_REQUIRED');
const postId=parsed.pathname.match(/(?:permalink|posts)\/(\d+)/)?.[1]||parsed.searchParams.get('story_fbid');
if(!/^\d+$/.test(postId||''))throw Error('NUMERIC_POST_ID_REQUIRED');
const dir=process.env.FB_TEST_DIR||`outputs/facebook-comment-retest-${postId}-${Date.now()}`;
await fs.mkdir(dir,{recursive:true,mode:0o700});
const lease=await createProxyManagerClient()({platform:'facebook',apiOperation:'comments',minProxyRemainingMs:360000});
await fs.writeFile(dir+'/fixed-proxy.credentials.json',JSON.stringify(lease),{mode:0o600});
const env={...process.env,FB_DIAG_DIR:dir,FB_DIAG_URL:url,FB_DIAG_POST_ID:postId,FB_DIAG_SKIP_REMOTE:'1'};
let tunnel;const heartbeat=setInterval(()=>lease.heartbeat().catch(()=>{}),20000);
try{
 if(process.env.FB_DIAG_RELAY==='1'){
  const hostValue=process.env.SSH_CRAWL_HOST||'',sshHost=new URL(hostValue.includes('://')?hostValue:'ssh://'+hostValue),endpoint=new URL(lease.server||`http://${lease.host}:${lease.port}`);
  const expect='set timeout 15\nlog_user 0\nspawn /usr/bin/ssh -N -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=yes -o ServerAliveInterval=20 -o ConnectTimeout=15 -o PreferredAuthentications=password,keyboard-interactive -o PubkeyAuthentication=no -p $env(FB_SSH_PORT) -L $env(FB_FORWARD) $env(FB_SSH_TARGET)\nexpect {\n -re "(?i)password:" {send -- "$env(SSH_CRAWL_PASS)\\r"; exp_continue}\n timeout {set timeout -1; exp_continue}\n eof {set r [wait];exit [lindex $r 3]}\n}';
  tunnel=spawn('/usr/bin/expect',['-c',expect],{env:{...env,FB_SSH_PORT:sshHost.port||'22',FB_SSH_TARGET:process.env.SSH_CRAWL_NAME+'@'+sshHost.hostname,FB_FORWARD:`127.0.0.1:${process.env.FB_PROXY_LOCAL_PORT||3852}:${endpoint.hostname}:${endpoint.port||80}`},stdio:'ignore',detached:true});await new Promise(r=>setTimeout(r,2500));
 }
 for(const [script,extra] of [['capture_facebook_fixed_incognito.mjs',{}],['facebook_fixed_proxy_diagnostic.mjs',{FB_DIAG_LABEL:'local-native-replay',FB_DIAG_MODE:'replay',FB_DIAG_WIRE:dir+'/wire-fresh.credentials.json'}],['facebook_fixed_proxy_diagnostic.mjs',{FB_DIAG_LABEL:'local-api-query',FB_DIAG_MODE:'capture'}],['check_facebook_target_availability.mjs',{}]]){
  if(process.env.FB_TEST_SKIP_BROWSER==='1'&&(script==='capture_facebook_fixed_incognito.mjs'||extra.FB_DIAG_MODE==='replay'))continue;
  const r=await run(process.execPath,['scripts/'+script],{env:{...env,...extra},timeout:360000,maxBuffer:1000000});
  await fs.writeFile(dir+'/'+script+'.log',r.stdout);console.log(JSON.stringify({stage:script,finished:true}));
  if(script==='capture_facebook_fixed_incognito.mjs'){const native=JSON.parse(await fs.readFile(dir+'/fresh-incognito-report.json'));if(native.gate){console.log(JSON.stringify({stopped:native.gate}));break;}}
  if(extra.FB_DIAG_MODE==='capture'){const diagnostic=JSON.parse(await fs.readFile(dir+'/local-api-query-capture-report.json'));const gate=diagnostic.phases.find(x=>/RATE_LIMIT|AUTH|SECURITY/.test(x.status||''))||diagnostic.collection?.stop;if(gate){if(/RATE_LIMIT/.test(gate.status||''))await lease.report({status:'rate_limited',reason:gate.status,retryAfterMs:gate.retryAfterMs||900000}).catch(()=>{});console.log(JSON.stringify({stopped:gate.status}));break;}}
 }
 console.log(JSON.stringify({reportDirectory:dir,postId}));
}finally{clearInterval(heartbeat);await lease.release();if(tunnel?.pid)try{process.kill(-tunnel.pid,'SIGTERM');}catch{}}
