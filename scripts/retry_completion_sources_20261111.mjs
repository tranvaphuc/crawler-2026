import fs from 'node:fs/promises';
import {createSocialInfoReaders} from '/opt/crawler-v8/current/src/services/socialInfo.js';
import {createConfiguredProxyProvider} from '/opt/crawler-v8/current/src/services/socialProxyConfig.js';
const refs=JSON.parse(await fs.readFile('/tmp/refresh-source-retry-20261111.json','utf8'));
const readers=createSocialInfoReaders({getProxy:createConfiguredProxyProvider()});
const results=[];
for(const ref of refs){
 try {const r=await readers.sourceInfo(ref);results.push({_id:ref._id,...r,transport:undefined});}
 catch(e){results.push({_id:ref._id,url:ref.url,platform:ref.platform,status:'error',reason:e.code||e.name,idVerified:false});}
 console.log(JSON.stringify({checked:results.length,total:refs.length,idVerified:results.at(-1).idVerified}));
 await fs.writeFile('/tmp/refresh-source-retry-result-20261111.json',JSON.stringify(results),{mode:0o644});
}
