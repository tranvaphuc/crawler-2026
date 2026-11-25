set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createRequire} from 'node:module';const require=createRequire('/opt/news-flow/current/package.json'),ch=require('cheerio'),r=JSON.parse(fs.readFileSync('/var/lib/news-flow/qc-20261122/wordpress-holdouts.json')),s=r.sites.find(s=>s.site==='nhansac.vn');for(const p of s.pages.slice(0,2)){const html=gunzipSync(fs.readFileSync(p.evidence)).toString(),$=ch.load(html);console.log(JSON.stringify({url:p.url,config:s.config.body,chars:$('.article-content').text().trim().length,nativeBody:$('.article-content').text().trim().slice(0,5500),nested:$('.article-content').find('article,[itemprop=articleBody],.article-body,.entry-content,.post-content').map((i,e)=>({tag:e.tagName,attrs:$(e).attr(),chars:$(e).text().length})).get()}));}
NODE
