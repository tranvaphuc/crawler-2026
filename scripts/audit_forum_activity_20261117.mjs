import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import {createResearchTransport} from '../src/web/researchTransport.mjs';
const root=path.resolve('outputs/forum-activity-2026-11-17');
await fs.mkdir(root,{recursive:true});
const domains=JSON.parse(await fs.readFile('outputs/news-es5-source-expansion-2026-11-16/known-forums.json','utf8'));
const configs=JSON.parse(await fs.readFile('outputs/news-forum-research-2026-11-09/forum-site-configurations.json','utf8'));
const transport=createResearchTransport({timeoutMs:12000,maxSockets:6});
const rows=[]; const queue=[...domains];
function inspect(html,url){
 const $=cheerio.load(html||''); $('script,style,noscript').remove();
 const dates=[];
 $('time,.DateTime,[data-time]').each((i,e)=>{const n=$(e);dates.push({value:n.attr('datetime')||n.attr('data-time')||n.attr('title')||n.text().trim(),text:n.text().trim(),context:n.parent().text().replace(/\s+/g,' ').slice(0,240),url:n.closest('a').attr('href')||null});});
 const links=[];$('a[href]').each((i,e)=>{try{const u=new URL($(e).attr('href'),url);if(u.hostname.replace(/^www\./,'')!==new URL(url).hostname.replace(/^www\./,''))return;const text=$(e).text().replace(/\s+/g,' ').trim();if(/\/(threads?|t|topic)\/[^/?#]+|showthread\.php|\/t\d+[-/]/i.test(u.href)&&text.length>12){u.hash='';links.push({url:u.href,text});}}catch{}});
 return {title:$('title').text(),dates,threads:[...new Map(links.map(x=>[x.url,x])).values()].slice(0,20),text:$('body').text().replace(/\s+/g,' ').slice(0,65000)};
}
async function visit(url,label){const r=await transport.get(url,root,label);const v=inspect(r.html,r.finalUrl||url);return {url:r.finalUrl||url,status:r.statusCode,error:r.error,evidence:label+'.html',...v};}
try{await Promise.all(Array.from({length:6},async()=>{while(queue.length){const domain=queue.shift();const config=configs.find(x=>x.domain===domain)?.configuration||{};const pages=[];try{
 const home=await visit(config.homepage||'https://'+domain+'/',domain+'-home');pages.push(home);
 let listing=home;
 if(config.findNewsUrl&&config.findNewsUrl!==home.url){listing=await visit(config.findNewsUrl,domain+'-feed');pages.push(listing);}
 if(!listing.threads.length&&config.categorySeeds?.length){listing=await visit(config.categorySeeds[0],domain+'-category');pages.push(listing);}
 for(const [i,t] of listing.threads.slice(0,2).entries()) pages.push(await visit(t.url,domain+'-thread-'+i));
 }catch(e){pages.push({error:e.message});}
 const row={domain,pages}; rows.push(row);await fs.writeFile(path.join(root,domain+'.audit.json'),JSON.stringify(row,null,2));console.log(JSON.stringify({domain,pages:pages.length,dates:pages.reduce((n,p)=>n+(p.dates?.length||0),0),errors:pages.map(p=>p.error).filter(Boolean)}));
 }}));}finally{await transport.close();await fs.writeFile(path.join(root,'results.json'),JSON.stringify(rows,null,2));}
