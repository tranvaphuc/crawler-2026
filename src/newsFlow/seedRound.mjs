import {createHash,randomUUID} from 'node:crypto';
import {requestKey} from './identity.mjs';
import {isExcludedSource} from '../web/sourceExclusions.mjs';

// A round is one immutable queue. New configuration is read only after every
// pending/running seed in the previous round has reached a terminal state.
export function admitSeedRound(state,now=Date.now()){
 return state.tx(()=>{
  if(state.db.prepare("SELECT 1 FROM tasks WHERE role='seed' AND state IN ('pending','running') LIMIT 1").get())return {added:0,reason:'queue_not_empty'};
  const unique=new Map();
  const candidates=state.articleSources
   ?[...state.articleSources.values()].flatMap(source=>(source.seeds||[]).map(url=>({site:source.domain,url})))
   :state.db.prepare('SELECT site,url FROM seed_sources ORDER BY url_key').all();
  for(const row of candidates){
   if(isExcludedSource(row.site)||isExcludedSource(row.url))continue;
   const key=requestKey(row.url);if(!unique.has(key))unique.set(key,{...row,key});
  }
  const rows=[...unique.values()].sort((a,b)=>a.key.localeCompare(b.key));
  if(!rows.length)return {added:0,reason:'no_configured_seeds'};
  const cycle='q-seed-'+randomUUID(),manifest=rows.map(({site,url,key})=>[key,url,site]);
  const sha256=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  state.db.prepare('INSERT INTO cycles(id,started) VALUES(?,?)').run(cycle,now);
  const seed=state.db.prepare('INSERT OR IGNORE INTO seed_sources(url_key,url,site) VALUES(?,?,?)');
  const job=state.db.prepare("INSERT INTO tasks(cycle,url,url_key,site,role,priority,created,seen_at) VALUES(?,?,?,?,'seed',100,?,?)");
  for(const row of rows){seed.run(row.key,row.url,row.site);job.run(cycle,row.url,row.key,row.site,now,now);}
  const round={cycle,started:now,total:rows.length,manifestSha256:sha256,admission:'complete_seed_rounds'};
  const put=state.db.prepare('INSERT INTO flow_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  put.run('news_seed_round',JSON.stringify(round));put.run('news_seed_round_manifest',JSON.stringify(manifest));
  state.db.prepare("DELETE FROM flow_meta WHERE key='three_flow_master_admission_seed'").run();
  return {...round,added:rows.length,batchLimit:null};
 },'admit_seed_round');
}
