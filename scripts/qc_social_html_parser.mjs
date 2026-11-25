import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {load} from 'cheerio';
import {readOnlyHtml} from '../src/services/socialHtmlSnapshot.js';

// Compare the selectors used for source identity, auth gates, metadata and
// native JSON. Never print HTML, token values or extracted payloads.
const files=process.argv.slice(2);
if(!files.length)files.push(...execFileSync('rg',['--files','outputs','test/fixtures','-g','*.html'],{encoding:'utf8'}).trim().split('\n').filter(Boolean));
const signature=$=>JSON.stringify({
 attributes:$('meta,link[rel="canonical"],input[name="lsd"],input[name="jazoest"]').map((_,e)=>({...e.attribs})).get(),
 texts:$('title,h1,h2,[role="heading"],script[type="application/json"]').map((_,e)=>$(e).text()).get(),
});
let baselineMs=0,optimizedMs=0,bytes=0;
const differences=[];
for(let pass=0;pass<3;pass++)for(const file of files){
 const html=fs.readFileSync(file,'utf8');if(!pass)bytes+=Buffer.byteLength(html);
 let started=performance.now();const baseline=load(html);baselineMs+=performance.now()-started;
 readOnlyHtml('');started=performance.now();const optimized=readOnlyHtml(html,{platform:'youtube'});optimizedMs+=performance.now()-started;
 if(!pass&&signature(baseline)!==signature(optimized))differences.push({file,bytes:Buffer.byteLength(html)});
}
console.log(JSON.stringify({files:files.length,passes:3,bytes,baselineMs,optimizedMs,speedup:baselineMs/optimizedMs,differences,baselineExcludesFreezeCost:true},null,2));
if(differences.length)process.exitCode=1;
