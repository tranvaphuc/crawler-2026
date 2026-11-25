import fs from 'node:fs';import {createHash} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';import {requestKey,articleKey} from '../src/newsFlow/identity.mjs';
const root='/var/lib/news-flow/vnexpress-miss-20261123',probe=JSON.parse(fs.readFileSync(root+'/ebank-probe.json')),before=JSON.parse(fs.readFileSync(root+'/audit.json')),file='config/web-sources/news/vnexpress.net.json',config=JSON.parse(fs.readFileSync(file)),target=before.url;
if(!probe.finishedAt||probe.articles.length!==20||probe.articles.some(a=>a.state!=='done'||a.reason!=='verified_outbox'||!a.doc||!a.proof?.ok))throw Error('FULL_PIPELINE_CONTROLS_NOT_VERIFIED');
const verified=probe.seeds.filter(s=>!s.error&&s.status===200&&s.url===s.finalUrl&&s.articles?.length&&s.url.startsWith('https://vnexpress.net/kinh-doanh/'));
if(verified.length!==14||!verified.some(s=>s.url.endsWith('/ngan-hang-sang-tao')&&s.discoveredTarget&&s.articles.some(a=>a.url===target)))throw Error('TARGET_SOURCE_COVERAGE_NOT_VERIFIED');
for(const field of ['body','title','publishedDate','variants'])if(JSON.stringify(config[field])!==JSON.stringify(before.config[field]))throw Error('PARSER_CONFIG_CHANGED_SINCE_PROBE');
const db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite'),state=new ThreeFlowState(db),r={at:new Date().toISOString(),paidManualAiCalls:0,seeds:[],discovered:0,offered:[],aiBefore:db.prepare('SELECT * FROM ai_usage ORDER BY day DESC LIMIT 2').all()};
try{
if(db.prepare('SELECT 1 FROM parser_overlays WHERE site=?').get('vnexpress.net'))throw Error('UNEXPECTED_VNEXPRESS_OVERLAY');
fs.writeFileSync(root+'/config-before.json',JSON.stringify(config,null,2));
config.discovery.categories=[...new Set([...config.discovery.categories,...verified.map(s=>s.url)])];fs.writeFileSync(root+'/config-after.json',JSON.stringify(config,null,2));
const tmp=file+'.vnexpress-coverage.tmp';fs.writeFileSync(tmp,JSON.stringify(config,null,2)+'\n');fs.chmodSync(tmp,0o644);fs.renameSync(tmp,file);
const registry=await loadNewsRegistry();state.configureSites(registry.sources.values());const source=registry.sources.get('vnexpress.net'),links=[...new Set(verified.flatMap(s=>s.articles.map(a=>a.url)))];
state.tx(()=>{
for(const seed of verified){const n=db.prepare('INSERT OR IGNORE INTO seed_sources(url_key,url,site) VALUES(?,?,?)').run(requestKey(seed.url),seed.url,source.domain).changes;r.seeds.push({url:seed.url,added:n});}
for(const url of links)if(state.discover(url,source.domain))r.discovered++;
// These documents already passed the unchanged complete processor in isolated
// memory state. Offer through the existing outbox and create-only importer.
for(const row of probe.articles){const doc=row.doc;if(doc._source.url!==row.url||row.proof.url!==row.url||row.proof.publishedDate!==doc._source.publishedDate)throw Error('VERIFIED_DOCUMENT_PROOF_MISMATCH');const current=db.prepare('SELECT parse_status FROM article_links WHERE parse_key=?').get(articleKey(row.url));if(!current||current.parse_status!=='pending')continue;state.offer(doc,{...source.config,publicationProof:row.proof},[row.url]);r.offered.push({url:row.url,id:doc._id,index:doc._index,contentSha256:createHash('sha256').update(doc._source.content).digest('hex')});state.event('verified',{cycle:'manual-vnexpress-coverage-20261123',site:source.domain,url:row.url,id:doc._id,index:doc._index,publishedDate:doc._source.publishedDate,publicationEvidence:row.proof.source,publicationPrecision:row.proof.precision});}
state.event('manual_seed_coverage_repair',{site:source.domain,seeds:r.seeds.map(s=>s.url),newLinks:r.discovered,offered:r.offered.length,reason:'business_and_ebank_child_sections_missing_from_static_seeds',paidManualAiCalls:0});
},'vnexpress_coverage_repair');
r.aiAfter=db.prepare('SELECT * FROM ai_usage ORDER BY day DESC LIMIT 2').all();r.uniqueSeedArticleUrls=links.length;r.target=db.prepare('SELECT * FROM article_links WHERE parse_key=?').get(articleKey(target));r.finishedAt=new Date().toISOString();fs.writeFileSync(root+'/apply.json',JSON.stringify(r,null,2));console.log(JSON.stringify(r));
}finally{state.close();}
