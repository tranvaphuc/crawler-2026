import {articleKey} from './identity.mjs';import {categoryUrl} from './categoryCoverage.mjs';
// Bring newly observed publisher breadcrumbs back into the same audit frontier.
// The live store stays read-only; qualification still controls seed activation.
export function ingestCategoryHintFrontier(scan,live,registry,{now=Date.now()}={}){
 scan.exec('CREATE TABLE IF NOT EXISTS hint_expansions(site TEXT,key TEXT,url TEXT,parent TEXT,at INTEGER,PRIMARY KEY(site,key))');
 const exists=scan.prepare('SELECT 1 FROM pages WHERE site=? AND key=?'),article=live.prepare('SELECT parse_status FROM article_links WHERE parse_key=?'),runtime=new Set(live.prepare('SELECT url FROM seed_sources').all().map(r=>articleKey(r.url))),insert=scan.prepare('INSERT OR IGNORE INTO pages(site,key,url,origin,parent,depth) VALUES(?,?,?,?,?,1)'),record=scan.prepare('INSERT OR IGNORE INTO hint_expansions VALUES(?,?,?,?,?)'),known=new Map([...registry.sources].map(([site,s])=>[site,new Set((s.seeds||[]).map(articleKey))])),rows=[];
 for(const hint of live.prepare("SELECT site,key,url,parent FROM news_category_hints WHERE state='pending'").all()){
  const s=registry.sources.get(hint.site);if(!s||s.config.originalPublicationBlockedReason)continue;const url=categoryUrl(hint.url,hint.parent||hint.url,s);if(!url)continue;const key=articleKey(url),owner=registry.byUrl(url);if(!owner||owner.domain!==s.domain&&owner.config.siteName!==s.config.siteName||exists.get(s.domain,key)||article.get(key)?.parse_status==='done')continue;
  rows.push({site:s.domain,key,url,parent:hint.parent,origin:known.get(s.domain)?.has(key)?'configured':runtime.has(key)?'runtime':'discovered'});
 }
 let added=0;scan.exec('BEGIN');try{for(const row of rows)if(insert.run(row.site,row.key,row.url,row.origin,row.parent).changes){record.run(row.site,row.key,row.url,row.parent,now);added++;}scan.exec('COMMIT');}catch(error){scan.exec('ROLLBACK');throw error;}
 return {added,totalExpanded:scan.prepare('SELECT count(*) n FROM hint_expansions').get().n,pendingPages:scan.prepare("SELECT count(*) n FROM pages WHERE state!='done'").get().n};
}
