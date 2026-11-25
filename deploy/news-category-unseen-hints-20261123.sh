set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import {DatabaseSync} from 'node:sqlite';import {loadNewsRegistry} from './src/newsFlow/registry.mjs';import {registerOriginalSources} from './src/newsFlow/baomoiOriginalBranch.mjs';import {ThreeFlowState} from './src/newsFlow/threeFlowState.mjs';import {categoryUrl} from './src/newsFlow/categoryCoverage.mjs';
const db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true}),scan=new DatabaseSync('/var/lib/news-flow/category-coverage-20261123/audit.sqlite',{readOnly:true}),registry=await loadNewsRegistry();registerOriginalSources(db,registry);ThreeFlowState.prototype.loadOverlays.call({db,configureSites:()=>{}},registry);const exists=scan.prepare('SELECT 1 FROM pages WHERE site=? AND key=?'),article=db.prepare('SELECT parse_status FROM article_links WHERE parse_key=?'),rows=[];
for(const r of db.prepare("SELECT site,key,url,parent,state FROM news_category_hints WHERE state='pending'").all()){const s=registry.sources.get(r.site);if(s&&!s.config.originalPublicationBlockedReason&&!exists.get(r.site,r.key)&&article.get(r.key)?.parse_status!=='done'&&categoryUrl(r.url,r.parent||r.url,s))rows.push(r);}
const counts={};for(const r of rows)counts[r.site]=(counts[r.site]||0)+1;console.log(JSON.stringify({unseenPendingHints:rows.length,sites:Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,15),examples:rows.slice(0,20)}));db.close();scan.close();
NODE
