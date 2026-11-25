import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {createGunzip,createGzip,constants} from 'node:zlib';
import {once} from 'node:events';
import {finished} from 'node:stream/promises';

const prior=path.resolve(process.argv[2]),out=path.join(prior,'recovery');
await fs.mkdir(out,{recursive:true});
const counts={},documents=new Set(),articles=new Map(),handled=new Set(),repair=new Set();
async function readLines(name,input,consume){let valid=0,invalid=0;for await(const line of readline.createInterface({input,crlfDelay:Infinity})){if(!line)continue;let row;try{row=JSON.parse(line);}catch{invalid++;continue;}await consume(row);valid++;}counts[name]={valid,invalid};}
const gzip=createGzip({level:1}),destination=createWriteStream(path.join(out,'documents.recovered.jsonl.gz'));gzip.pipe(destination);
// Accept a missing final gzip trailer only for the interrupted artifact. Every
// recovered record must still be complete JSON; write a new, properly closed gzip.
await readLines('recoveredDocuments',createReadStream(path.join(prior,'documents.jsonl.gz')).pipe(createGunzip({finishFlush:constants.Z_SYNC_FLUSH})),async row=>{const key=row._index+'/'+row._id;if(documents.has(key))return;documents.add(key);if(!gzip.write(JSON.stringify(row)+'\n'))await once(gzip,'drain');});
gzip.end();await finished(destination);
await readLines('discovery',createReadStream(path.join(prior,'listing-discovery.jsonl')),r=>{for(const url of r.articles){let entry=articles.get(url);if(!entry){entry={url,domains:new Set(),foundOnCount:0,foundOnExamples:[]};articles.set(url,entry);}entry.domains.add(r.domain);entry.foundOnCount++;if(entry.foundOnExamples.length<3)entry.foundOnExamples.push(r.listingUrl);}});
await readLines('articleResults',createReadStream(path.join(prior,'article-results.jsonl')),r=>{handled.add(r.url);if(r.results.some(x=>x.documentKey&&!documents.has(x.documentKey)))repair.add(r.url);});
const pending=[...articles.values()].filter(e=>!handled.has(e.url)||repair.has(e.url)).map(e=>({...e,domains:[...e.domains],repairMissingDocument:repair.has(e.url)}));
const selectedDomains=new Set();await readLines('listingResults',createReadStream(path.join(prior,'listing-results.jsonl')),r=>selectedDomains.add(r.domain));
await fs.writeFile(path.join(out,'pending-articles.json'),JSON.stringify(pending));
await fs.writeFile(path.join(out,'recovered-document-keys.json'),JSON.stringify([...documents]));
await fs.writeFile(path.join(out,'selected-domains.json'),JSON.stringify([...selectedDomains]));
const report={recoveredAt:new Date().toISOString(),priorDirectory:prior,counts,recoveredDocuments:documents.size,discoveredUniqueArticleUrls:articles.size,handledArticleUrls:handled.size,repairMissingDocumentUrls:repair.size,pendingArticleUrls:pending.length,pendingDanTri:pending.filter(e=>new URL(e.url).hostname.replace(/^www\./,'')==='dantri.com.vn').length,selectedSourceCount:selectedDomains.size};
await fs.writeFile(path.join(out,'recovery.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
