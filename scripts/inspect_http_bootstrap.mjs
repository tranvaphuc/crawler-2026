import {createHttpExecutor} from '../src/services/socialHttpTransport.js';
import {createConfiguredProxyProvider} from '../src/services/socialProxyConfig.js';
import {load} from 'cheerio';
import {assignedJson,snapshotPayloads} from '../src/services/socialMetrics.js';
import {walkContent} from '../src/services/socialContent.js';
const run=createHttpExecutor({getProxy:createConfiguredProxyProvider()});
for(const [platform,url]of [['facebook','https://www.facebook.com/1000419343151470_122138942931244237'],['threads','https://www.threads.com/@hapas.vn'],['instagram','https://www.instagram.com/p/CciJju6P5In/'],['youtube','https://www.youtube.com/watch?v=wlQndvtII1M']]){
 const r=await run({platform},async session=>{
  const s=await session.request(url),$=load(s.html),roots=snapshotPayloads(s.html),config=assignedJson(s.html,'ytcfg.set('),initial=assignedJson(s.html,'ytInitialData');
  const continuations=[];walkContent(initial,(v,path)=>{if(v.continuationCommand||v.continuationEndpoint||v.nextContinuationData)continuations.push({path,keys:Object.keys(v),targetId:v.targetId||null});});
  return {status:'checked',httpStatus:s.httpStatus,finalPath:new URL(s.finalUrl).pathname,title:$('title').text(),bytes:s.html.length,scripts:roots.length,rootKeys:roots.slice(0,3).map(x=>Object.keys(x||{})),configKeys:config?Object.keys(config):[],continuations:continuations.slice(0,15),metaDescription:$('meta[name="description"]').attr('content')?.slice(0,100),jsonKeys:[...s.html.matchAll(/"(xdt_[a-z_]+|xig_[a-z_]+|mediaData|__bbox|require|handle|jsmods|errorDescription|errorSummary)"/g)].slice(0,12).map(x=>x[1])};
 });console.log(JSON.stringify({platform,...r}));
}
