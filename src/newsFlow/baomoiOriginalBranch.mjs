import net from 'node:net';
import {articleKey,requestUrl,nativeKey,nativeArticleId,urlAliases} from './identity.mjs';
import {isExcludedSource} from '../web/sourceExclusions.mjs';
import {resolveBaomoiOriginalLink} from '../web/baomoiOriginalLink.mjs';

export function originalHost(raw){
 try{const u=new URL(raw),h=u.hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');
  return /^https?:$/.test(u.protocol)&&!u.username&&!u.password&&!u.port&&!net.isIP(h)&&h.includes('.')&&!/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(h)&&h!=='baomoi.com'&&!isExcludedSource(h)?h:null;
 }catch{return null;}
}
export function initializeOriginalBranch(db){db.exec(`
 CREATE TABLE IF NOT EXISTS baomoi_original_refs(article_id TEXT PRIMARY KEY,baomoi_url TEXT NOT NULL,original_key TEXT NOT NULL,original_url TEXT NOT NULL,evidence_url TEXT NOT NULL,at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS baomoi_original_articles(original_key TEXT PRIMARY KEY,url TEXT NOT NULL,host TEXT NOT NULL,site TEXT,status TEXT NOT NULL DEFAULT 'pending',reason TEXT,at INTEGER NOT NULL,es_checked_at INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS baomoi_original_ready ON baomoi_original_articles(status,at);
 CREATE TABLE IF NOT EXISTS baomoi_original_sources(host TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'pending',config TEXT,report TEXT,at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS baomoi_original_scans(parse_key TEXT PRIMARY KEY,status TEXT NOT NULL,reason TEXT,at INTEGER NOT NULL);
 `);}
// Each reference is immutable evidence of a specific Baomoi article. A single
// normalized original URL can have many references, but only one admission.
export function recordOriginalLink(state,result,now=Date.now()){
 if(!result?.ok||!/^\d+$/.test(result.articleId)||!originalHost(result.originalUrl))return false;
 const url=requestUrl(result.originalUrl),host=originalHost(url),key=articleKey(url);
 return state.tx(()=>{
  const prior=state.db.prepare('SELECT original_key FROM baomoi_original_refs WHERE article_id=?').get(result.articleId);
  if(prior&&prior.original_key!==key)return false;
  state.db.prepare('INSERT OR IGNORE INTO baomoi_original_refs VALUES(?,?,?,?,?,?)').run(result.articleId,result.baomoiUrl,key,url,result.evidenceUrl||result.baomoiUrl,now);
  const inserted=state.db.prepare('INSERT OR IGNORE INTO baomoi_original_articles(original_key,url,host,at) VALUES(?,?,?,?)').run(key,url,host,now);
  state.db.prepare('INSERT OR IGNORE INTO baomoi_original_sources(host,at) VALUES(?,?)').run(host,now);
  if(inserted.changes)state.db.prepare("UPDATE baomoi_original_sources SET status='pending' WHERE host=? AND status='held' AND at<?").run(host,now-3600000);
  return true;
 });
}
export async function captureOriginalLink(state,task,page,transport){
 let result;try{result=await resolveBaomoiOriginalLink(task.url,url=>url===task.url?Promise.resolve(page):transport.get(url,null,'original-link'));}catch(e){if(e.code==='ERR_SQLITE_ERROR')throw e;result={ok:false,reason:'original_link_transport_unavailable'};}
 await state.writeAsync(()=>state.tx(()=>{
  recordOriginalLink(state,result);
  state.db.prepare('INSERT OR IGNORE INTO baomoi_original_scans VALUES(?,?,?,?)').run(articleKey(task.url),result.ok?'captured':'held',result.reason||null,Date.now());
 }));return result;
}
export function registerOriginalSources(db,registry,driver){
 let added=0;
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='baomoi_original_sources'").get())return added;
 for(const row of db.prepare("SELECT host,config FROM baomoi_original_sources WHERE status='active' AND config IS NOT NULL").all()){
  if(registry.byHost(row.host))continue;
  const config=JSON.parse(row.config);if(config.siteName!==row.host||!originalHost('https://'+row.host))continue;
  const source=registry.register(config);if(source?.domain===row.host){added++;for(const h of [row.host,...source.config.allowedHosts||[]])driver?.allowed.add(h.replace(/^www\./,''));}
 }
 return added;
}
export function refreshOriginalSources(state,registry,driver){
 const added=registerOriginalSources(state.db,registry,driver);
 if(added){state.configureSites(registry.sources.values());state.syncSeeds(registry);}return added;
}
function priorNativeLink(state,url,source){
 const key=nativeKey(url,source.config),id=nativeArticleId(url,source.config);if(!key||!id||!/^[a-zA-Z0-9_-]+$/.test(id))return null;
 return state.db.prepare('SELECT url,parse_status FROM article_links WHERE site=? AND url LIKE ?').all(source.domain,'%'+id+'%').find(r=>nativeKey(r.url,source.config)===key);
}
export async function reconcileOriginalArticles(state,registry,es,limit=50){
 const hosts=state.db.prepare('SELECT host FROM baomoi_original_sources').all().map(r=>r.host).filter(h=>registry.byHost(h));if(!hosts.length)return 0;
 const candidates=state.db.prepare("SELECT * FROM baomoi_original_articles WHERE status IN ('pending','awaiting_source') AND es_checked_at=0 AND host IN ("+hosts.map(()=>'?').join(',')+") ORDER BY at LIMIT ?").all(...hosts,limit).filter(r=>registry.byUrl(r.url));
 if(!candidates.length)return 0;
 const keys=new Map(candidates.map(r=>[articleKey(r.url),r]));
 // Query all weekly indexes before admission, including http/www variants.
 const response=await es.search({index:'master*',type:'newsTopic',ignoreUnavailable:true,allowNoIndices:true,body:{size:1000,_source:['url','siteName'],query:{terms:{url:[...new Set(candidates.flatMap(r=>urlAliases(r.url)))]}}}});
 const hits=response.hits?.hits;if(!Array.isArray(hits))throw Error('ORIGINAL_ES_LOOKUP_UNCONFIRMED');
 if(response.timed_out||response._shards?.failed||Number(response.hits.total)>hits.length)throw Error('ORIGINAL_ES_LOOKUP_INCOMPLETE');
 state.tx(()=>{const bound=new Set();for(const hit of hits.sort((a,b)=>a._index.localeCompare(b._index))){const url=hit._source?.url,row=url&&keys.get(articleKey(url)),source=row&&registry.byUrl(row.url);if(!source||registry.byUrl(url)?.domain!==source.domain||bound.has(row.original_key))continue;if(!state.known(row.url,source.config))state.bind(hit,[row.url,url],source.config);bound.add(row.original_key);}
  for(const row of candidates)state.db.prepare('UPDATE baomoi_original_articles SET es_checked_at=? WHERE original_key=?').run(Date.now(),row.original_key);
 });return candidates.length;
}
export function admitOriginalArticles(state,registry,limit=100,{requireEsCheck=false}={}){
 let admitted=0;
 return state.tx(()=>{
  for(const row of state.db.prepare("SELECT a.* FROM baomoi_original_articles a JOIN baomoi_original_sources s ON s.host=a.host WHERE a.status='pending' OR a.status='awaiting_source' AND s.status IN ('active','existing') ORDER BY a.at LIMIT ?").all(limit)){
   if(!originalHost(row.url)){state.db.prepare("UPDATE baomoi_original_articles SET status='excluded',reason='excluded_or_invalid_host' WHERE original_key=?").run(row.original_key);continue;}
   const source=registry.byUrl(row.url);if(!source){state.db.prepare("UPDATE baomoi_original_articles SET status='awaiting_source' WHERE original_key=?").run(row.original_key);continue;}
   const known=state.known(row.url,source.config),prior=state.db.prepare('SELECT parse_status FROM article_links WHERE parse_key=?').get(articleKey(row.url))||priorNativeLink(state,row.url,source);
   if(requireEsCheck&&!known&&!prior&&!row.es_checked_at)continue;
   if(!known&&!prior){state.discover(row.url,source.domain);admitted++;}
   state.db.prepare('UPDATE baomoi_original_articles SET site=?,status=?,reason=? WHERE original_key=?').run(source.domain,known?'existing':prior?'linked':'queued',known?'identity_ledger':prior?.parse_status||null,row.original_key);
   state.db.prepare("UPDATE baomoi_original_sources SET status='existing' WHERE host=? AND status='pending'").run(row.host);
  }return admitted;
 });
}
