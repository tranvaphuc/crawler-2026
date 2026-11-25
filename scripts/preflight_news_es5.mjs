import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import vm from 'node:vm';import {createRequire} from 'node:module';import dotenv from 'dotenv';import ES from 'elasticsearch';
import {legacyNewsId,weeklyIndex} from '../src/web/newsParser.mjs';
const env={...dotenv.parse(await fs.readFile('.env')), ...process.env};
if(!env.ES5_HOST)throw Error('ES5_HOST_MISSING');
const root=path.resolve('outputs/news-flow-build-2026-11-12');await fs.mkdir(root,{recursive:true});
const code=await fs.readFile('../eastdata/scripts/news/lib/parser.js','utf8');
const match=code.match(/Parser\.prototype\.getArticleId\s*=\s*(function\(url, article\)\s*\{[\s\S]*?\n\});/);
if(!match)throw Error('EASTDATA_ID_FUNCTION_NOT_FOUND');
const require=createRequire(path.resolve('../eastdata/package.json')),Uri=require('URIjs');
const legacyCrypto={createHash(algo){const hash=crypto.createHash(algo);return {update(text){hash.update(text,'latin1');return this;},digest(format){return hash.digest(format);}};}};
const legacyFn=vm.runInNewContext('('+match[1]+')',{Uri,Crypto:legacyCrypto});
const modernFn=vm.runInNewContext('('+match[1]+')',{Uri,Crypto:crypto});
const es=new ES.Client({apiVersion:'5.6',host:env.ES5_HOST,log:[],maxRetries:0,requestTimeout:30000});
let phase='info';
try{
 const info=await es.info(),index=weeklyIndex(new Date().toISOString());
 phase='mapping';
 const mapping=await es.indices.getMapping({index,type:'newsTopic'});
 phase='samples';
 const result=await es.search({index,type:'newsTopic',body:{size:30,query:{terms:{siteName:['kenh14.vn','vnexpress.net','antt.vn','dantri.com.vn']}},sort:[{publishedDate:'desc'}]}});
 const hits=result.hits.hits;
 if(!hits.length)throw Error('NO_EXISTING_NEWS_SAMPLES');
 const proof=hits.map(h=>{const s=h._source,domain=new Uri(s.url).domain(),encoded=legacyFn(s.url,{title:s.title}),utf8=modernFn(s.url,{title:s.title});return {index:h._index,id:h._id,url:s.url,title:s.title,siteName:s.siteName,publishedDate:s.publishedDate,domain,eastdataLatin1Id:encoded,currentLatin1Id:legacyNewsId({registrableDomain:domain,title:s.title,identityUrl:s.url}),modernUtf8Id:utf8,idMatchesLatin1:encoded===h._id,idMatchesUtf8:utf8===h._id,indexMatches:weeklyIndex(s.publishedDate)===h._index,authorIdMatchesLegacy:crypto.createHash('md5').update(String(s.siteId)+String(s.author),'latin1').digest('hex')===s.authorId};});
 const boundary=[];
 const monday=new Date();const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(monday).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));const d=new Date(Date.UTC(+parts.year,+parts.month-1,+parts.day));d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));const edge=d.getTime()-7*3600000;
 for(const side of [-1,1]){const since=new Date(edge+(side<0?-3600000:0)).toISOString(),until=new Date(edge+(side<0?0:3600000)).toISOString(),i=weeklyIndex(since);const r=await es.search({index:i,type:'newsTopic',body:{size:1,query:{range:{publishedDate:{gte:since,lt:until}}},sort:[{publishedDate:'asc'}]}});for(const h of r.hits.hits)boundary.push({index:h._index,id:h._id,publishedDate:h._source.publishedDate,expected:weeklyIndex(h._source.publishedDate)});}
 const fallback=hits.filter(h=>h._source.author===h._source.siteName),fallbackMatches=fallback.filter(h=>h._source.authorId===h._source.siteId).length;
 const summary={checkedAt:new Date().toISOString(),readOnly:true,clusterFingerprint:crypto.createHash('sha256').update(info.cluster_uuid).digest('hex'),esVersion:info.version.number,index,samples:proof.length,latin1Matches:proof.filter(p=>p.idMatchesLatin1).length,utf8Matches:proof.filter(p=>p.idMatchesUtf8).length,indexMatches:proof.filter(p=>p.indexMatches).length,authorLegacyMatches:proof.filter(p=>p.authorIdMatchesLegacy).length,authorFallbackSamples:fallback.length,authorFallbackMatches:fallbackMatches,boundary,verified:proof.every(p=>p.idMatchesLatin1&&p.indexMatches)&&boundary.length===2&&boundary.every(p=>p.index===p.expected)&&fallbackMatches===fallback.length,eastdataFunctionSha256:crypto.createHash('sha256').update(match[1]).digest('hex')};
 await fs.writeFile(path.join(root,'es5-existing-samples.json'),JSON.stringify(hits,null,2));await fs.writeFile(path.join(root,'es5-news-mapping.json'),JSON.stringify(mapping,null,2));await fs.writeFile(path.join(root,'identity-proof.json'),JSON.stringify({summary,proof},null,2));
 console.log(JSON.stringify(summary,null,2));if(!summary.verified)process.exitCode=2;
}catch(e){console.log(JSON.stringify({error:'ES5_PREFLIGHT_FAILED',phase,code:e.code||(/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name),status:e.statusCode||e.status||null}));process.exitCode=1;}finally{es.close();}
