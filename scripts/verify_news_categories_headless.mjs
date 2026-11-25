import {loadNewsDateContext} from '../src/web/newsDateContext.mjs';import {isNewsCategoryUrl} from '../src/web/newsCategoryPolicy.mjs';import fs from 'node:fs/promises';import path from 'node:path';import * as cheerio from 'cheerio';
import {discoverNewsLinks,parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';
import {createNewsResearchTransport as createResearchTransport} from '../src/web/newsResearchTransport.mjs';
const root=path.resolve(process.argv.includes('--output-root')?process.argv[process.argv.indexOf('--output-root')+1]:'outputs/news-parser-rollout-2026-11-09'),read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const rows=await read(path.join(root,'reviewed-results.json')),targets=await read(path.join(root,'targets.json'));
const only=process.argv.includes('--domains')?new Set(process.argv[process.argv.indexOf('--domains')+1].split(',')):null;
const queue=rows.filter(r=>only?only.has(r.domain):r.status==='parser_passed_category_unverified'),total=queue.length,log=[];
const transport=createResearchTransport();const run=Date.now().toString(36);let active=0;
const timer=setInterval(()=>console.log(JSON.stringify({phase:'http-category',checked:log.length,total,active,verified:log.filter(r=>r.success).length})),30000);
function candidateLinks(html,url,site){
 const $=cheerio.load(html),out=[];let linkBase=url;try{const b=new URL($('base[href]').first().attr('href'),url);if(b.origin===new URL(url).origin)linkBase=b.href;}catch{}
 $('nav a[href],header a[href],[class*=menu] a[href],[class*=breadcrumb] a[href],[class*=category] a[href],[class*=cate] a[href],a[rel=category],a[href]').each((i,a)=>{
  const text=$(a).text().trim().replace(/\s+/g,' ');try{const u=new URL($(a).attr('href'),linkBase),base=new URL(url);u.hash='';
   if(!/^https?:$/.test(u.protocol)||u.hostname.replace(/^www\./,'')!==base.hostname.replace(/^www\./,'')||u.pathname==='/'||text.length<2||text.length>55||/\d{5,}|\.(jpg|png|xml|pdf)$|login|register|contact|lien-he|gioi-thieu|privacy|terms|rss|tag\/|tac-gia|author|tim-kiem/i.test(u.pathname))return;
   out.push({url:u.href,title:text});
  }catch{}
 });
 function breadcrumbs(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(breadcrumbs);return;}if(x['@type']==='BreadcrumbList')for(const v of x.itemListElement||[]){const raw=typeof v.item==='string'?v.item:v.item?.['@id']||v.item?.url;if(raw)try{out.push({url:new URL(raw,url).href,title:v.name||v.item?.name||'Structured breadcrumb'});}catch{}}if(x['@graph'])breadcrumbs(x['@graph']);}
 $('script[type="application/ld+json"]').each((i,e)=>{try{breadcrumbs(JSON.parse($(e).text()));}catch{}});
 return out;
}
try{await Promise.all(Array.from({length:3},async()=>{while(queue.length){const r=queue.shift(),site=targets.find(s=>s.domain===r.domain),dir=path.join(root,'sites',r.domain);active++;let report={domain:r.domain,attempts:[]};
 try{
  const context=await loadNewsDateContext(dir);const config=await read(path.join(dir,'config.json')),discovery=await read(path.join(dir,'discovery.json')),samples=await read(path.join(dir,'samples.json'));
  const reviewed=await read(path.join(dir,'reviewed-samples.json')).catch(()=>[]);const validSamples=[...reviewed.filter(s=>s.parsed),...samples.filter(s=>s.parsed)];
  const home=await transport.get(discovery.homepage||site.url,dir,`r2-${run}-category-home`,{});
  let candidates=[];if(home.html&&!home.error){const d=discoverNewsLinks(home.html,home.finalUrl,site);candidates.push(...d.categories,...candidateLinks(home.html,home.finalUrl,site));}
  for(const s of validSamples.slice(0,3))if(s.htmlFile){const html=await fs.readFile(path.join(dir,s.htmlFile),'utf8');candidates.push(...candidateLinks(html,s.finalUrl||s.url,site));}
  candidates.push(...discovery.categories||[],...(site.legacy.categorySeeds||[]).map(url=>({url})));
  const seen=new Set();candidates=candidates.filter(c=>{if(seen.has(c.url)||samples.some(s=>s.url===c.url)||!isNewsCategoryUrl(c.url,site))return false;seen.add(c.url);return true;});const validUrls=validSamples.map(s=>s.url);const score=c=>(c.fromPublicWpTaxonomy?20:0)+(/\/search\/label\//.test(c.url)?15:0)+validUrls.filter(u=>u.startsWith(c.url.replace(/\/$/,'')+'/')).length*10+(/\/(news|tin-tuc|thoi-su|chinh-tri)(?:\/|$)/.test(new URL(c.url).pathname)?2:0);candidates.sort((a,b)=>score(b)-score(a));candidates=candidates.slice(0,8);
  report.homeError=home.error;report.candidates=candidates;
  for(const [i,c] of candidates.entries()){
   const label=`r2-${run}-category-${i+1}`,p=await transport.get(c.url,dir,label,{});
   const attempt={url:c.url,error:p.error,finalUrl:p.finalUrl,evidence:label+'.json',articles:0};report.attempts.push(attempt);if(!p.html||p.error)continue;
   // A category must not just redirect to the homepage or an article.
   const bloggerLabel=site.domain.endsWith('.blogspot.com')&&/^\/search\/label\//.test(new URL(p.finalUrl).pathname);const nativeWpQuery=site.domain==='goodstock.vn'&&new URL(p.finalUrl).searchParams.get('rest_route')==='/wp/v2/posts'&&/^[1-9]\d*$/.test(new URL(p.finalUrl).searchParams.get('categories')||'');if(new URL(p.finalUrl).pathname==='/'&&!nativeWpQuery||!bloggerLabel&&!parseConfiguredArticle(p.html,c.url,config,context).error){attempt.error='not_category_listing';continue;}
   const d=discoverNewsLinks(p.html,p.finalUrl,site);discovery.articles=[...new Map([...(discovery.articles||[]),...d.articles].map(a=>[a.url,a])).values()];await fs.writeFile(path.join(dir,'discovery.json'),JSON.stringify(discovery,null,2));attempt.articles=d.articles.length;if(d.articles.length<(bloggerLabel?1:2))continue;
   for(const [j,a] of [...d.articles].sort((a,b)=>Number(validSamples.some(s=>s.url===b.url))-Number(validSamples.some(s=>s.url===a.url))).slice(0,3).entries()){
    const al=label+'-article-'+(j+1),ap=await transport.get(a.url,dir,al,{});
    const doc=ap.html&&!ap.error?parseConfiguredArticle(ap.html,a.url,config,context):{error:ap.error||'missing_html'};
    attempt.articleError=doc.error||null;if(doc.error||new URL(ap.finalUrl).pathname==='/')continue;
    samples.push({url:a.url,fromCategory:true,holdout:true,categoryValidation:true,categoryUrl:c.url,evidence:ap.evidenceFile||al+'.json',htmlFile:ap.htmlFile,finalUrl:ap.finalUrl,method:ap.method,error:null,parsed:doc});
    const extra={url:c.url,kind:'category',articleCount:d.articles.length,httpEvidence:label+'.json',format:d.sourceKind||'html'};
    report.success={categoryUrl:c.url,articleUrl:a.url,evidence:ap.evidenceFile||al+'.json'};
    await fs.writeFile(path.join(dir,'samples.json'),JSON.stringify(samples,null,2));
    await fs.appendFile(path.join(root,'results.jsonl'),JSON.stringify({...r,listingEvidence:[...(r.listingEvidence||[]),extra]})+'\n');break;
   }if(report.success)break;
  }
 }catch(e){report.error=e.message;}active--;log.push(report);await fs.writeFile(path.join(root,only?'category-http-'+run+'.json':'category-http.json'),JSON.stringify(log,null,2));console.log(JSON.stringify({domain:r.domain,success:!!report.success,attempts:report.attempts.length,error:report.error}));
}}));}finally{clearInterval(timer);await transport.close();console.log(JSON.stringify({checked:log.length,verified:log.filter(r=>r.success).length}));}
