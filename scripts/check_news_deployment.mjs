import fs from 'node:fs/promises';import dotenv from 'dotenv';import ES from 'elasticsearch';
import {NewsState} from '../src/newsFlow/state.mjs';import {NewsEs5Sink} from '../src/newsFlow/es5.mjs';import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';import {toEs5News,validateNewsMapping} from '../src/newsFlow/identity.mjs';
const env={...dotenv.parse(await fs.readFile('.env')),...process.env},proof=JSON.parse(await fs.readFile('/etc/news-flow/identity-proof.json','utf8')),registry=await loadNewsRegistry(),state=await NewsState.open('outputs/news-flow-runtime/deployment-check.sqlite'),es=new ES.Client({apiVersion:'5.6',host:env.ES5_HOST,log:[],maxRetries:0,requestTimeout:30000});
let report;
try{
 const sink=new NewsEs5Sink({es,state,proof,write:false});await sink.initialize();
 const config=registry.sources.get('kenh14.vn').config,now=new Date().toISOString();
 const parsed={_source:{title:'Deployment schema check only',content:'Schema check only; never submitted to Elasticsearch.',description:'No article data copied for this check.',url:'https://kenh14.vn/deployment-check-123456789.chn',publishedDate:now,siteId:config.siteId,siteName:config.siteName},extracted:{datePrecision:'second',dateEvidence:now,dateTimezone:'explicit_offset',authorWasFallback:true}};
 const doc=toEs5News(parsed,config),mapping=await sink.mapping(doc);validateNewsMapping(doc,mapping);
 const proxy=JSON.parse(await fs.readFile('outputs/news-flow-build-2026-11-12/proxy-health.json','utf8')),tests=await fs.readFile('outputs/deploy-tests.tap','utf8');
 const pass=Number(tests.match(/^# pass (\d+)/m)?.[1]),fail=Number(tests.match(/^# fail (\d+)/m)?.[1]);
 const envStat=await fs.stat('/etc/news-flow/news.env'),proxyStat=await fs.stat('/etc/news-flow/proxies.json');
 report={checkedAt:now,nodeVersion:process.version,sources:registry.sources.size,seeds:[...registry.sources.values()].reduce((n,s)=>n+s.seeds.length,0),es5ClusterVerified:sink.ready,mappingVerified:true,tests:{pass,fail},proxyHealth:{total:proxy.proxies,healthy:proxy.healthy},privateConfig:(envStat.mode&7)===0&&(proxyStat.mode&7)===0,readOnly:true};
 report.verified=report.sources===544&&pass>=208&&fail===0&&proxy.proxies===11&&proxy.healthy===11&&report.privateConfig;if(!report.verified)process.exitCode=2;
}catch(e){report={verified:false,error:e.code||(/^[A-Z0-9_]+$/.test(e.message)?e.message:'DEPLOYMENT_CHECK_FAILED')};process.exitCode=1;}finally{es.close();state.close();}
await fs.writeFile('outputs/deployment-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
