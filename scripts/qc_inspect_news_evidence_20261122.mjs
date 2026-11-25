import fs from 'node:fs';import {createRequire} from 'node:module';import {gunzipSync} from 'node:zlib';
const base='/opt/news-flow/current',root='/var/lib/news-flow/qc-20261122',require=createRequire(base+'/package.json'),cheerio=require('cheerio'),audit=JSON.parse(fs.readFileSync(root+'/news-audit.json'));
const wanted=['nhansac.vn','tintuctoday.net','travelguide.org.vn','dulichgiaitri.com','danhgiaxe.com'];const rows=[];
for(const site of audit.sites.filter(s=>wanted.includes(s.site)))for(const a of site.articles.filter(a=>a.evidence)){
 const html=gunzipSync(fs.readFileSync(a.evidence.file)).toString(),$=cheerio.load(html),h=$('h1').first(),body=$(site.config.body?.selector||'article').first();
 const ancestors=node=>node.parents().toArray().slice(0,9).map(e=>({tag:e.tagName,id:$(e).attr('id'),class:$(e).attr('class'),h1:$(e).find('h1').length,time:$(e).find('time').length,containsBody:body.length&&body.parents().toArray().includes(e),bodyChars:$(e).text().trim().length}));
 const clean=$('body').clone();clean.find('script,style,nav,footer').remove();
 rows.push({site:site.site,url:a.url,heading:h.text(),headings:$('h1').map((i,e)=>$(e).text()).get(),headingAncestors:ancestors(h),metadata:$('meta').toArray().filter(e=>/date|time|publish/i.test([$(e).attr('name'),$(e).attr('property'),$(e).attr('itemprop')].join(' '))).map(e=>$(e).attr()),times:$('time,[itemprop="datePublished"]').toArray().slice(0,3).map(e=>({attrs:$(e).attr(),text:$(e).text(),ancestors:ancestors($(e))})),dateStrings:[...new Set(clean.text().match(/(?:\d{1,2}[:h]\d{2}(?::\d{2})?[^\n]{0,70}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4}[^\n]{0,70})/g)||[])].slice(0,12),dateAttributes:html.match(/(?:data-[\w-]*(?:date|time)|publish\w*|created\w*)\s*[=:]\s*["'][^"']{4,100}["']/gi)?.slice(0,12)});
}
fs.writeFileSync(root+'/parser-evidence-inspection.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
