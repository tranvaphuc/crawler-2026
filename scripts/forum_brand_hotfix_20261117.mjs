// One-off brand backfill. This script never opens the system collector's state.
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import * as cheerio from 'cheerio';
import dotenv from 'dotenv';import ES from 'elasticsearch';
import {ForumState} from '../src/forumFlow/state.mjs';import {ForumRuntime} from '../src/forumFlow/runtime.mjs';
import {discover,topicUrl,nativeThreadId,parsePage,safeUrl} from '../src/forumFlow/adapters.mjs';import {BrandHotfixSink} from './forum_brand_hotfix_batch_20261117.mjs';
const args=process.argv.slice(2),opt=(k,f)=>args.includes(k)?args[args.indexOf(k)+1]:f;
const output=path.resolve(opt('--output','outputs/forum-brand-hotfix-2026-11-17/run'));if(/\/var\/lib\/forum-flow\/runtime(?:\/|$)/.test(output.replaceAll('\\','/')))throw Error('SYSTEM_STATE_FORBIDDEN');
await fs.mkdir(output,{recursive:true});
const registry=JSON.parse(await fs.readFile('config/forum-flow/sites.json','utf8'));const selected=opt('--sites','').split(',').filter(Boolean);const sites=registry.filter(s=>!selected.length||selected.includes(s.domain));
const findSite=u=>{try{return sites.find(s=>s.allowedHosts.includes(new URL(u).hostname));}catch{return null;}};
const state=await ForumState.open(path.join(output,'state.sqlite'));state.setSince(Date.parse('2026-10-01T00:00:00+07:00'));
state.db.exec('CREATE TABLE IF NOT EXISTS hotfix_matches(site TEXT,url TEXT,native_thread_id TEXT,brands TEXT,found_on TEXT,status TEXT,reason TEXT,PRIMARY KEY(site,url))');
export function brandsIn(value){const text=String(value||'').replace(/Gửi từ[^\n]*(?:App|tapatalk|voz)[^\n]*/gi,'');return Object.entries({OPPO:/\boppo\b/i,Samsung:/\bsamsung\b|\bgalaxy\s+(?:[sazmf]\d|fold|flip|watch|tab)/i,Apple:/\bapple\b|\biphone\b|\bipad\b|\bmacbook\b|\bairpods\b/i,Huawei:/\b(?:huawei|huwei|hwawei)\b/i}).filter(([,p])=>p.test(text)).map(([name])=>name);}
const number=(k,f)=>{const v=Number(opt(k,f));if(!Number.isSafeInteger(v)||v<1)throw Error('INVALID_'+k);return v;};
const runtime=new ForumRuntime({state,sites,evidenceDirectory:path.join(output,'evidence'),maxThreadPages:number('--max-pages',100),maxTopicsPerSite:1000,onEvent:e=>{if(e.kind==='topic_failed')console.log(JSON.stringify(e));}});
const memo=new Map(),fetchOriginal=runtime.fetch.bind(runtime);
runtime.fetch=async(site,url)=>{const key=site.domain+'|'+url;if(memo.has(key)){const r=memo.get(key);memo.delete(key);return r;}try{return await fetchOriginal(site,url);}catch(e){if(site.domain==='vnreview.vn'&&new URL(url).hostname==='www.vnreview.vn'&&e.message==='DOWNLOAD_access_blocked'){const u=new URL(url);u.hostname='vnreview.vn';return fetchOriginal(site,u.href);}throw e;}};
let stopped=false;const owner=state.lock(),beforeWrite=()=>{const lease=state.db.prepare('SELECT * FROM forum_lease WHERE id=1').get();if(lease?.owner!==owner||lease.expires<=Date.now())throw Error('HOTFIX_LEASE_LOST');};const heartbeat=setInterval(()=>{try{state.heartbeat(owner);}catch{stopped=true;runtime.stop();}},20000);for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{stopped=true;runtime.stop();});
const remember=(site,url,brands,found,status,reason=null,id=null)=>state.db.prepare('INSERT INTO hotfix_matches VALUES(?,?,?,?,?,?,?) ON CONFLICT(site,url) DO UPDATE SET brands=excluded.brands,status=excluded.status,reason=excluded.reason,native_thread_id=COALESCE(excluded.native_thread_id,hotfix_matches.native_thread_id)').run(site.domain,url,id,JSON.stringify(brands),found,status,reason);
function admit(site,url,found){const u=topicUrl(url,site);if(site.threadPattern&&!new RegExp(site.threadPattern,'i').test(new URL(u).pathname)||site.adapter==='wordpress'&&!/^\/[^/]+\/?$/.test(new URL(u).pathname))return false;const id=nativeThreadId(u)||(site.adapter==='wordpress'?'url:'+createHash('sha256').update(u).digest('hex'):null);if(!id)return false;state.enqueue(site.domain,u,id);if(!state.db.prepare('SELECT 1 FROM hotfix_matches WHERE site=? AND url=?').get(site.domain,u))remember(site,u,[],found,'candidate',null,id);return true;}
try{
 if(args.includes('--retry-failed'))state.db.exec("UPDATE hotfix_matches SET status='candidate' WHERE status='failed'");
 if(args.includes('--discover')){
  const searches=JSON.parse(await fs.readFile(opt('--searches','outputs/forum-brand-hotfix-2026-11-17/web-searches.json'),'utf8'));
  const urls=[...new Set(searches.flatMap(s=>[...s.text.matchAll(/\((https?:\/\/[^\s)]+)\)/g)].map(m=>m[1])))];
  const seeds=new Map(sites.map(s=>[s.homepage,{site:s,url:s.homepage,depth:0}]));
  for(const u of urls){const site=findSite(u);if(!site)continue;if(!admit(site,u,'web_search')){const p=new URL(u).pathname;if(!/\.(pdf|jpg|png)$|\/(members|profile|u)\//i.test(p))seeds.set(u,{site,url:u,depth:0});}}
  const queue=[...seeds.values()],visited=new Set();let i=0;
  await Promise.all(Array.from({length:2},async()=>{while(i<queue.length&&!stopped){const entry=queue[i++],{site,url,depth}=entry;if(visited.has(url))continue;visited.add(url);try{
   const r=await runtime.fetch(site,url);const $=cheerio.load(r.html);let added=0;
   $('a[href]').each((j,a)=>{const href=safeUrl($(a).attr('href'),r.finalUrl,site);if(!href)return;const text=$(a).text().replace(/\s+/g,' ').trim();if(brandsIn(text).length&&admit(site,href,url))added++;});
   if(depth===0){let followed=0;for(const a of $('a[href]').toArray()){const href=safeUrl($(a).attr('href'),r.finalUrl,site);if(!href||visited.has(href)||followed>=8)continue;const p=new URL(href).pathname,text=$(a).text().trim();if(/\/(?:forums?|f|chuyen-muc|tags?)\//.test(p)&&/smartphone|điện thoại|android|ios|công nghệ|oppo|samsung|apple|huawei/i.test(text+' '+p)){queue.push({site,url:href,depth:1});followed++;}}}
   console.log(JSON.stringify({phase:'discovery',site:site.domain,url,topicLinks:added}));
  }catch(e){state.event(site.domain,url,'hotfix_discovery_failed',{reason:e.message});console.log(JSON.stringify({phase:'discovery_failed',site:site.domain,url,reason:e.message}));}}}));
 }
 if(args.includes('--collect')){
  const limit=number('--limit-topics',1000),statuses=args.includes('--candidates-only')?"('candidate')":"('candidate','matched','partial')",rows=state.db.prepare("SELECT u.* FROM forum_urls u JOIN hotfix_matches h ON h.site=u.site AND h.url=u.url WHERE h.status IN "+statuses+" AND u.processed=0 ORDER BY u.site,u.native_id LIMIT ?").all(limit);let i=0;
  await Promise.all(Array.from({length:2},async()=>{while(i<rows.length&&!stopped){const row=rows[i++],site=sites.find(s=>s.domain===row.site);if(!site)continue;
   try{const r=await runtime.fetch(site,row.url),parsed=parsePage(r.html,r.finalUrl,site);const first=parsed.posts.find(p=>p.role==='forumTopic');const brands=brandsIn((parsed.title||'')+'\n'+(first?.content||''));
    if(!parsed.complete||!first)throw Error('ROOT_PARSE_'+(parsed.rejected?.map(x=>x.reason).join(';')||'missing_original_topic'));if(String(parsed.nativeThreadId)!==String(row.native_id)&&site.adapter!=='wordpress')throw Error('HOTFIX_ROOT_NATIVE_ID_MISMATCH');
    if(!brands.length){remember(site,row.url,[],null,'irrelevant','brand_not_in_original_topic',parsed.nativeThreadId);state.status(row,1,'hotfix_irrelevant');continue;}
    remember(site,row.url,brands,null,'matched',null,parsed.nativeThreadId);memo.set(site.domain+'|'+row.url,r);await runtime.topic(site,row);
    const updated=state.db.prepare('SELECT * FROM forum_urls WHERE site=? AND native_id=?').get(row.site,row.native_id);remember(site,row.url,brands,null,updated.processed?'collected':'partial',updated.reason,parsed.nativeThreadId);
    console.log(JSON.stringify({phase:'collected',site:site.domain,url:row.url,brands,complete:!!updated.processed,reason:updated.reason}));
   }catch(e){remember(site,row.url,[],null,'failed',e.message);state.status(row,0,e.message,null,300000);console.log(JSON.stringify({phase:'collect_failed',site:row.site,url:row.url,reason:e.message}));}
  }}));
 }
 if(args.includes('--import')){
  if(args.includes('--retry-transient'))state.db.exec("UPDATE forum_documents SET export_state='pending' WHERE export_state='held' AND (export_reason IN ('HOTFIX_POST_CREATE_UNCONFIRMED','HOTFIX_CREATE_RESPONSE_UNCONFIRMED','HOTFIX_IDENTITY_SEARCH_INCOMPLETE') OR export_reason LIKE '%Timeout%')");
  const env={...dotenv.parse(await fs.readFile('.env')),...process.env},es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',log:[],maxRetries:0,requestTimeout:30000});
  const proof=JSON.parse(await fs.readFile(opt('--proof','outputs/forum-flow-es5-preflight-2026-11-17.json'),'utf8'));
  try{const sink=new BrandHotfixSink({es,state,sites,proof,write:args.includes('--write'),beforeWrite});await sink.initialize();const limit=number('--limit-import',100000);let done=0;
   const batch=Math.min(50,number('--batch-size',20));while(done<limit&&!stopped){const pending=state.db.prepare("SELECT COUNT(*) n FROM forum_documents WHERE export_state='pending'").get().n;if(!pending)break;const results=await sink.flush(Math.min(batch,limit-done),{onResult:r=>console.log(JSON.stringify({phase:'import',...r}))});done+=results.length;if(results.some(r=>/Timeout|UNCONFIRMED|SEARCH_INCOMPLETE|CREATE_FAILED_429|CREATE_FAILED_50/.test(r.reason||''))){console.log(JSON.stringify({phase:'stopped',reason:'ES_TRANSIENT_FAILURE_REQUIRES_RECHECK'}));break;}if(!args.includes('--write')||!results.length)break;}
  }finally{es.close();}
 }
}finally{
 clearInterval(heartbeat);await runtime.transport.close();const summary={at:new Date().toISOString(),systemStateModified:false,servicesModified:false,...state.summary(),matches:state.db.prepare('SELECT site,status,brands,COUNT(*) count FROM hotfix_matches GROUP BY site,status,brands').all(),exports:state.db.prepare('SELECT export_state,export_reason,COUNT(*) count FROM forum_documents GROUP BY export_state,export_reason').all()};
 await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(state.db.prepare('SELECT * FROM hotfix_matches ORDER BY site,url').all(),null,2));console.log(JSON.stringify({phase:'summary',...summary}));state.unlock(owner);state.close();
}
