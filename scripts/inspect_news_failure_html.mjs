import fs from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import * as cheerio from 'cheerio';
const domains=process.argv.slice(2);
for(const domain of domains){let r;try{r=JSON.parse(await fs.readFile('outputs/news-site-errors-2026-11-13/recheck-'+domain+'.json','utf8'));}catch{continue;}const config=JSON.parse(await fs.readFile('config/web-sources/news/'+domain+'.json','utf8'));
 console.log(JSON.stringify({domain,dateConfig:config.publishedDate,body:config.body,title:config.title,variants:config.variants?.map(v=>({date:v.publishedDate}))}));
 for(const item of r.articles.slice(0,2)){if(!item.htmlPath)continue;const html=gunzipSync(await fs.readFile(item.htmlPath)).toString(),$=cheerio.load(html),clean=x=>String(x||'').replace(/\s+/g,' ').trim();
  const fields=$('meta').toArray().filter(e=>/description|date|publish|time|author/i.test($(e).attr('name')||$(e).attr('property')||$(e).attr('itemprop')||'')).map(e=>({key:$(e).attr('name')||$(e).attr('property')||$(e).attr('itemprop'),value:$(e).attr('content')}));
  const nodes=$('[class*=sapo],[class*=Sapo],[class*=summary],[class*=Summary],[class*=lead],[class*=Lead],[class*=description],[class*=Description],time,[class*=date],[class*=Date]').toArray().filter(e=>!$(e).parents('nav,footer,aside,.related,.comments').length).slice(0,35).map(e=>({tag:e.tagName,class:$(e).attr('class'),id:$(e).attr('id'),itemprop:$(e).attr('itemprop'),datetime:$(e).attr('datetime'),text:clean($(e).text()).slice(0,380),parent:$(e).parent().attr('class')}));
  console.log(JSON.stringify({url:item.url,h1:clean($('h1').first().text()),fields,nodes,schema:$('script[type="application/ld+json"]').toArray().map(e=>$(e).text().slice(0,2800))}));
 }
}
