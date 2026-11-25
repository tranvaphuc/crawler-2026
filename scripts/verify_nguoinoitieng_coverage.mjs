import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import * as cheerio from 'cheerio';
import {absolute,pageKind,normalizeUrl} from './crawl_nguoinoitieng.mjs';
const root='outputs/nguoinoitieng-2026-11-18';
const db=new DatabaseSync(root+'/celebrities.sqlite',{readOnly:true});
const queue=db.prepare('SELECT url,kind,status FROM crawl_queue').all();
const byUrl=new Map(queue.map(r=>[r.url,r]));
const pages=db.prepare('SELECT html_gzip FROM pages WHERE url=?');
const referenced=new Set(),missing=[],pagination=new Map();
let archivePages=0;
for(const row of queue){
  if(!['listing','sitemap'].includes(row.kind)||row.status!=='done')continue;
  const archived=pages.get(row.url);if(!archived){missing.push({url:row.url,reason:'missing_html_archive'});continue;}
  const $=cheerio.load(gunzipSync(archived.html_gzip).toString('utf8'),{xmlMode:row.kind==='sitemap'});
  const raw=row.kind==='sitemap'?$('loc').map((_,e)=>$(e).text()).get():$('a[href]').map((_,e)=>$(e).attr('href')).get();
  for(const value of raw){const url=absolute(value,row.url);if(!url||!pageKind(url))continue;const normalized=normalizeUrl(url);referenced.add(normalized);if(!byUrl.has(normalized))missing.push({url:normalized,source:row.url,reason:'referenced_url_not_in_queue'});}
  archivePages++;
}
for(const row of queue){
  if(row.kind!=='listing'||!row.url.includes('/nghe-nghiep/'))continue;
  const match=new URL(row.url).pathname.match(/^(\/nghe-nghiep\/[^/]+)(?:\/page(\d+))?$/);if(!match)continue;
  const key=match[1];if(!pagination.has(key))pagination.set(key,new Set());pagination.get(key).add(Number(match[2]??1));
}
const gaps=[];
for(const [career,seen] of pagination){const max=Math.max(...seen);for(let n=1;n<=max;n++)if(!seen.has(n))gaps.push({career,page:n});}
const result={checked_at:new Date().toISOString(),archive_listing_and_sitemap_pages_checked:archivePages,career_directories:pagination.size,unique_valid_referenced_urls:referenced.size,missing_references:[...new Map(missing.map(m=>[m.url,m])).values()],career_pagination_gaps:gaps,queue:db.prepare('SELECT kind,status,count(*) n FROM crawl_queue GROUP BY kind,status').all(),resolved_source_references:db.prepare('SELECT count(*) n FROM source_link_resolutions').get().n,coverage_scope:'All valid profile and listing links in archived career/province listing pages and published sitemaps, plus consecutive discovered career pagination. Hidden/unlinked pages and future updates cannot be proven from these archives.'};
fs.writeFileSync(root+'/coverage-verification.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,missing_references:result.missing_references.slice(0,12),career_pagination_gaps:gaps.slice(0,12)},null,2));db.close();
