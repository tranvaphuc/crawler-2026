import fs from 'node:fs';import {timingSafeEqual}from'node:crypto';
const failure=code=>Object.assign(Error(code),{code});
export async function uploadAnonymousGroupCandidate(config,payload,{Client,timeoutMs=180000}={}){
 const expected=Buffer.from(config.hostKeyBase64||'','base64');if(expected.length<40||expected.length>2048)throw failure('SERVER_HOST_KEY_UNCONFIGURED');
 const key=fs.readFileSync(config.privateKey);if(!Client){const ssh=await import('ssh2');Client=ssh.Client||ssh.default.Client;}
 return new Promise((resolve,reject)=>{
  const client=new Client();let settled=false,stdout='';const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);try{error?client.destroy():client.end()}catch{}error?reject(error):resolve(result)};
  const timer=setTimeout(()=>finish(failure('SERVER_VALIDATION_TIMEOUT')),timeoutMs);
  client.on('error',()=>finish(failure('SSH_UPLOAD_FAILED')));
  client.on('close',()=>{if(!settled)finish(failure('SERVER_RESPONSE_INVALID'))});
  client.on('ready',()=>client.exec('refresh-anonymous-group',{pty:false},(error,channel)=>{
   if(error)return finish(failure('SSH_EXEC_FAILED'));
   channel.on('data',bytes=>{stdout+=bytes;if(Buffer.byteLength(stdout)>100000)finish(failure('SERVER_RESPONSE_INVALID'))});
   channel.stderr.on('data',()=>{});channel.on('error',()=>finish(failure('SSH_UPLOAD_FAILED')));
   channel.on('close',()=>{let result;for(const line of stdout.split(/\r?\n/)){try{const row=JSON.parse(line);if(['updated','kept_current'].includes(row.status))result=row}catch{}}result?finish(null,result):finish(failure('SERVER_RESPONSE_INVALID'))});
   channel.end(JSON.stringify(payload)+'\n');
  }));
  try{client.connect({host:config.serverHost,port:config.serverPort,username:config.serverUser,privateKey:key,readyTimeout:20000,keepaliveInterval:15000,keepaliveCountMax:3,algorithms:{serverHostKey:['ssh-ed25519']},hostVerifier:actual=>Buffer.isBuffer(actual)&&actual.length===expected.length&&timingSafeEqual(actual,expected)});}catch{finish(failure('SSH_UPLOAD_FAILED'))}
 });
}
