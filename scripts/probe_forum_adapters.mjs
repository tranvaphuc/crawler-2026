import fs from 'node:fs/promises';import * as c from 'cheerio';import {createResearchTransport} from '../src/web/researchTransport.mjs';
const input='outputs/forum-activity-2026-11-17',out='outputs/forum-flow-evidence-2026-11-17';await fs.mkdir(out,{recursive:true});
const t=createResearchTransport({timeoutMs:15000,validateHtml:false});const tasks=[];
for(const d of ['bovagau.vn','dff.vn','offb.vn','phunuvietkhoinghiep.vn']){const $=c.load(await fs.readFile(`${input}/${d}-home.html`,'utf8'));let u;
 if(d==='bovagau.vn')u=$('a[href]').map((i,e)=>$(e).attr('href')).get().find(u=>/^\/[^/]+-\d+$/.test(u));
 if(d==='dff.vn')u=$('a[href*="-p"]').first().attr('href');
 if(d==='offb.vn')u=$('a[href]').map((i,e)=>$(e).attr('href')).get().find(u=>/^\/[^/]+-\d+$/.test(u));
 if(d==='phunuvietkhoinghiep.vn')u=$('.anwp-pg-post-teaser__title a,a.anwp-link-without-effects').first().attr('href');
 if(u)tasks.push({d,url:new URL(u,'https://'+d).href,label:d+'-detail'});
 if(d==='dff.vn')tasks.push({d,url:'https://media.dff.vn/static/js/article.js?v=2',label:d+'-js'});
 if(d==='offb.vn')for(const u of ['/assets/js/offb-fb-detail.js?v=20261031seq1','/assets/js/offb-social.js?v=20261029182000'])tasks.push({d,url:new URL(u,'https://'+d).href,label:d+'-js-'+tasks.length});
}
for(const d of ['tctd.vn','vietnambusinessinsider.vn']){const $=c.load(await fs.readFile(`${input}/${d}-home.html`,'utf8'));for(const u of $('script[src]').map((i,e)=>$(e).attr('src')).get().filter(x=>x.startsWith('/themes/')))tasks.push({d,url:new URL(u,'https://'+d).href,label:d+'-js-'+tasks.length});}
const q=[...tasks];try{await Promise.all(Array.from({length:4},async()=>{while(q.length){const task=q.shift(),r=await t.get(task.url,out,task.label);console.log(JSON.stringify({task,error:r.error,bytes:r.html?.length}));}}));}finally{await t.close();}
