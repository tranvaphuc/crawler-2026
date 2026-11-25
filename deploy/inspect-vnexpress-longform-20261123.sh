set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import * as cheerio from 'cheerio';const root='/var/lib/news-flow/vnexpress-miss-20261123',r=JSON.parse(fs.readFileSync(root+'/holdouts.json')),a=r.rows.find(a=>a.url.includes('5137371')),html=gunzipSync(fs.readFileSync(a.file)).toString(),$=cheerio.load(html);
console.log(JSON.stringify({iframes:$('iframe').toArray().map(e=>({src:$(e).attr('src'),id:$(e).attr('id')})),scriptSources:$('script[src]').toArray().map(e=>$(e).attr('src')),texts:$('p').toArray().map(e=>({class:$(e).attr('class'),parent:$(e).parent().attr('class'),text:$(e).text().trim().slice(0,180)})).filter(p=>p.text.length>80).slice(0,12),heads:$('h1,h2,h3').toArray().map(e=>({tag:e.tagName,class:$(e).attr('class'),text:$(e).text().trim().slice(0,150)})).slice(0,12),articleBodies:$('[itemprop="articleBody"],article,[class*=content],[class*=detail]').toArray().slice(0,30).map(e=>({tag:e.tagName,id:$(e).attr('id'),class:$(e).attr('class'),chars:$(e).text().trim().length,paragraphs:$(e).find('p').length}))}));
NODE
