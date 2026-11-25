// Require both a primary editorial listing and two verified original articles.
// No requests to AI; the authoritative live store is opened read-only.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {registerOriginalSources} from '../src/newsFlow/baomoiOriginalBranch.mjs';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {articleKey} from '../src/newsFlow/identity.mjs';
import {reusablePrimaryArticleProof,distinctPrimaryArticleUrls,verifiedCategoryArticleCount} from '../src/newsFlow/categoryAuditCheckpoint.mjs';
import {categoryUrl} from '../src/newsFlow/categoryCoverage.mjs';

const root=process.env.NEWS_CATEGORY_AUDIT_ROOT||'/var/lib/news-flow/category-coverage-20261123';
const live=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});
const db=new DatabaseSync(root+'/applications.sqlite'),registry=await loadNewsRegistry();
registerOriginalSources(live,registry);
ThreeFlowState.prototype.loadOverlays.call({db:live,configureSites:()=>{}},registry);
db.prepare('ATTACH DATABASE ? AS scan').run(root+'/audit.sqlite');
db.exec(`PRAGMA journal_mode=WAL;PRAGMA synchronous=NORMAL;PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS candidate_qualifications(site TEXT NOT NULL,key TEXT NOT NULL,url TEXT NOT NULL,listing INTEGER NOT NULL,reason TEXT,checked_at INTEGER NOT NULL,primary_count INTEGER NOT NULL,PRIMARY KEY(site,key));
 CREATE TABLE IF NOT EXISTS candidate_article_proofs(site TEXT NOT NULL,key TEXT NOT NULL,urls TEXT NOT NULL,structural_listing INTEGER NOT NULL,verified_articles INTEGER NOT NULL,checked_at INTEGER NOT NULL,PRIMARY KEY(site,key));`);
db.exec('CREATE TABLE IF NOT EXISTS qualification_meta(key TEXT PRIMARY KEY,value TEXT)');const policy='primary-originals-pagination-20261123-v3';if(db.prepare("SELECT value FROM qualification_meta WHERE key='policy'").get()?.value!==policy){db.exec('BEGIN');try{db.exec('UPDATE candidate_qualifications SET checked_at=0 WHERE listing=1;UPDATE candidate_article_proofs SET checked_at=0');db.prepare("INSERT OR REPLACE INTO qualification_meta VALUES('policy',?)").run(policy);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
const verified=live.prepare('SELECT a.parse_status,coalesce(b.es_id,i.es_id) es_id,coalesce(b.es_index,i.es_index) es_index FROM article_links a LEFT JOIN news_category_backfill b ON b.parse_key=a.parse_key LEFT JOIN identities i ON i.key=a.parse_key WHERE a.parse_key=?');
for(const row of db.prepare('SELECT q.site,q.key,q.url,c.urls FROM candidate_qualifications q JOIN candidate_article_proofs c ON c.site=q.site AND c.key=q.key WHERE q.listing=1').all()){const s=registry.sources.get(row.site);if(!s)continue;if(!categoryUrl(row.url,row.url,s)){db.prepare("UPDATE candidate_qualifications SET listing=0,reason='utility_or_non_editorial_url',checked_at=? WHERE site=? AND key=?").run(Date.now(),row.site,row.key);continue;}const count=verifiedCategoryArticleCount(JSON.parse(row.urls),s,registry,key=>verified.get(key));if(count<2){db.prepare("UPDATE candidate_qualifications SET listing=0,reason='awaiting_two_verified_editorial_articles' WHERE site=? AND key=?").run(row.site,row.key);db.prepare('UPDATE candidate_article_proofs SET verified_articles=? WHERE site=? AND key=?').run(count,row.site,row.key);}}
const rows=db.prepare(`SELECT p.*,q.reason prior_reason,c.urls cached_urls,c.structural_listing,c.checked_at proof_checked_at
 FROM scan.pages p LEFT JOIN candidate_qualifications q ON q.site=p.site AND q.key=p.key
 LEFT JOIN candidate_article_proofs c ON c.site=p.site AND c.key=p.key
 WHERE p.origin='discovered' AND p.state='done' AND p.error IS NULL AND p.listing=1
 AND (q.key IS NULL OR q.listing=1 AND c.key IS NULL OR q.reason='awaiting_two_verified_editorial_articles' OR q.checked_at<p.checked_at)`).all();
const pool=new NewsRepairPool(4,new URL('../src/newsFlow/categoryCoverageWorker.mjs',import.meta.url),{maxOldGenerationSizeMb:256});
const save=db.prepare('INSERT OR REPLACE INTO candidate_qualifications VALUES(?,?,?,?,?,?,?)');
const proof=db.prepare('INSERT OR REPLACE INTO candidate_article_proofs VALUES(?,?,?,?,?,?)');
for(const q of db.prepare('SELECT site,key FROM candidate_qualifications WHERE listing=1').all())if(verified.get(q.key)?.parse_status==='done')db.prepare("UPDATE candidate_qualifications SET listing=0,reason='verified_article_not_section',checked_at=? WHERE site=? AND key=?").run(Date.now(),q.site,q.key);
let cursor=0,accepted=0,unconfirmed=0;
try {
 await Promise.all(Array.from({length:4},async()=>{
  while(cursor<rows.length){
   const row=rows[cursor++],s=registry.sources.get(row.site);let result;
   if(verified.get(row.key)?.parse_status==='done'){save.run(row.site,row.key,row.final_url||row.url,0,'verified_article_not_section',Date.now(),0);unconfirmed++;continue;}
   if(s&&!categoryUrl(row.final_url||row.url,row.url,s)){save.run(row.site,row.key,row.final_url||row.url,0,'utility_or_non_editorial_url',Date.now(),0);unconfirmed++;continue;}
   if(!s||!row.evidence||!fs.existsSync(row.evidence)){
    save.run(row.site,row.key,row.final_url||row.url,0,'source_or_saved_html_unavailable',Date.now(),0);unconfirmed++;continue;
   }
   if(reusablePrimaryArticleProof(row)){
    const urls=JSON.parse(row.cached_urls);result={listing:row.structural_listing===1,reason:'primary_editorial_listing',primaryArticleCount:urls.length,primaryArticles:urls.map(url=>({url}))};
   }else result=await pool.run({html:gunzipSync(fs.readFileSync(row.evidence)).toString(),url:row.final_url||row.url,source:{domain:s.domain,config:s.config},seeds:s.seeds,qualificationOnly:true});
   const urls=distinctPrimaryArticleUrls(result.primaryArticles).slice(0,20);
   const count=verifiedCategoryArticleCount(urls,s,registry,key=>verified.get(key));
   const ok=!!result.listing&&count>=2,reason=result.listing&&!ok?'awaiting_two_verified_editorial_articles':result.error||result.reason;
   const now=Date.now();db.exec('BEGIN');try{
    save.run(row.site,row.key,row.final_url||row.url,ok?1:0,reason,now,result.primaryArticleCount||0);
    proof.run(row.site,row.key,JSON.stringify(urls),result.listing?1:0,count,now);db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   ok?accepted++:unconfirmed++;
  }
 }));
 console.log(JSON.stringify({at:new Date().toISOString(),checked:rows.length,accepted,unconfirmed,requiresTwoOriginalArticleProofs:true,paidManualAiCalls:0}));
}finally{await pool.close();db.close();live.close();}
