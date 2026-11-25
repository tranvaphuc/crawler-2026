import {createHttpExecutor} from '../src/services/socialHttpTransport.js';
import {createConfiguredProxyProvider} from '../src/services/socialProxyConfig.js';
import {snapshotPayloads} from '../src/services/socialMetrics.js';
import {walkContent} from '../src/services/socialContent.js';
const run=createHttpExecutor({getProxy:createConfiguredProxyProvider()});
for(const [platform,url]of [['threads','https://www.threads.com/@hapas.vn'],['instagram','https://www.instagram.com/p/CciJju6P5In/'],['facebook','https://www.facebook.com/1000419343151470_122138942931244237']]){
const r=await run({platform},async session=>{
 const s=await session.request(url,{headers:{'user-agent':'Mozilla/5.0',accept:'text/html'}}),roots=snapshotPayloads(s.html);const shapes=[];
 for(const root of roots)walkContent(root,(v,path)=>{
  if(v.queryID||v.queryId||v.doc_id||v.preloaderID||v.preloadableID||v.__bbox?.result||v.__bbox?.define)shapes.push({path,keys:Object.keys(v),name:v.queryName||v.preloaderID||null,queryId:v.queryID||v.queryId||v.doc_id||v.preloadableID||null,variableKeys:Object.keys(v.variables||{}),dataKeys:Object.keys(v.__bbox?.result?.data||{}),defines:v.__bbox?.define?.slice(0,8).map(x=>x[0])});
  if(Array.isArray(v)&&v[0]==='RelayPrefetchedStreamCache')shapes.push({path,module:v[0],method:v[1],argTypes:v[3]?.map(x=>typeof x)});
 });
 return{status:'checked',httpStatus:s.httpStatus,shapes:shapes.slice(-25),bytes:s.html.length};
});console.log(JSON.stringify({platform,...r}));}
