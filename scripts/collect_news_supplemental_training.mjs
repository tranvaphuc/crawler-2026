import fs from 'node:fs/promises';import path from 'node:path';
import {createNewsResearchTransport as createResearchTransport} from '../src/web/newsResearchTransport.mjs';import {discoverNewsLinks} from '../src/web/configurableNewsParser.mjs';import {loadNewsDateContext} from '../src/web/newsDateContext.mjs';
const root=path.resolve(process.argv.includes('--output-root')?process.argv[process.argv.indexOf('--output-root')+1]:'outputs/news-parser-rollout-2026-11-09'),read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const requested=process.argv[process.argv.indexOf('--domains')+1].split(','),targets=(await read(path.join(root,'targets.json'))).filter(t=>requested.includes(t.domain));
const transport=createResearchTransport(),run=Date.now().toString(36),log=[];
try{await Promise.all(Array.from({length:2},async()=>{while(targets.length){const site=targets.shift(),dir=path.join(root,'sites',site.domain),report={domain:site.domain,added:0,attempts:[]};
 try{const samples=await read(path.join(dir,'samples.json')),context=await loadNewsDateContext(dir);let discovery=await read(path.join(dir,'discovery.json'));
  const home=await transport.get(site.url,dir,'r3-'+run+'-supplement-home',{});let fresh=[];
  if(home.html&&!home.error){const d=discoverNewsLinks(home.html,home.finalUrl,site);fresh=d.articles;discovery.categories=[...new Map([...(discovery.categories||[]),...d.categories].map(c=>[c.url,c])).values()];}
  const all=[...(context.items||[]).map(i=>({url:i.url,title:i.title,score:25})),...fresh,...(discovery.articles||[])];const used=new Set(samples.map(s=>s.url)),seen=new Set();
  const dateKey=u=>{const m=u.match(/\/(20\d{2})(?:\/?)(\d{2})\//);return m?Number(m[1]+m[2]):0;};
  const candidates=all.filter(a=>{if(used.has(a.url)||seen.has(a.url))return false;seen.add(a.url);return true;}).sort((a,b)=>Number(!!context.publicationDates?.[b.url])-Number(!!context.publicationDates?.[a.url])||dateKey(b.url)-dateKey(a.url));
  discovery.articles=[...new Map([...fresh,...(discovery.articles||[]),...all].map(a=>[a.url,a])).values()];
  for(const [i,a] of candidates.slice(0,4).entries()){if(report.added>=2)break;const label='r3-'+run+'-supplement-training-'+i,p=await transport.get(a.url,dir,label,{});report.attempts.push({url:a.url,error:p.error});if(p.error||!p.html)continue;
   samples.push({url:a.url,fromCategory:false,holdout:false,supplementalTraining:true,evidence:label+'.json',htmlFile:p.htmlFile,finalUrl:p.finalUrl,method:p.method,error:null,parsed:null});report.added++;
  }
  await fs.writeFile(path.join(dir,'samples.json'),JSON.stringify(samples,null,2));await fs.writeFile(path.join(dir,'discovery.json'),JSON.stringify(discovery,null,2));
 }catch(e){report.error=e.message;}log.push(report);await fs.writeFile(path.join(root,'supplement-training-'+run+'.json'),JSON.stringify(log,null,2));console.log(JSON.stringify(report));
}}));}finally{await transport.close();}
