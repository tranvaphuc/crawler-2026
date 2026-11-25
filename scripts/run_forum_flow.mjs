import fs from 'node:fs/promises';import path from 'node:path';
import {ForumState} from '../src/forumFlow/state.mjs';import {ForumRuntime} from '../src/forumFlow/runtime.mjs';
import {exportForumDocuments} from '../src/forumFlow/documentExport.mjs';
const args=process.argv.slice(2);const option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const positive=(name,fallback)=>{const raw=option(name,fallback);if(raw===undefined)return undefined;const n=Number(raw);if(!Number.isSafeInteger(n)||n<1)throw Error('INVALID_'+name);return n;};
const output=path.resolve(option('--output','outputs/forum-flow'));await fs.mkdir(output,{recursive:true});
const selected=option('--sites','').split(',').filter(Boolean);const all=JSON.parse(await fs.readFile(option('--registry','config/forum-flow/sites.json'),'utf8'));
for(const d of selected)if(!all.some(x=>x.domain===d))throw Error('UNKNOWN_FORUM_SITE_'+d);
const sites=all.filter(x=>!selected.length||selected.includes(x.domain));const state=await ForumState.open(option('--state',path.join(output,'state.sqlite')));
const runtime=new ForumRuntime({state,sites,evidenceDirectory:path.join(output,'evidence'),since:option('--since','2026-10-01T00:00:00+07:00'),maxTopicsPerSite:positive('--max-topics-per-site',50),maxCatchupTopicsPerSite:positive('--max-catchup-topics-per-site'),maxSeedPages:positive('--max-seed-pages'),maxThreadPages:positive('--max-thread-pages'),onEvent:event=>console.log(JSON.stringify(event))});
process.on('SIGINT',()=>runtime.stop());process.on('SIGTERM',()=>runtime.stop());
try{await runtime.run({once:!args.includes('--continuous')});}finally{try{const summary=state.summary();await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));await exportForumDocuments(state.db,path.join(output,'documents.jsonl'));console.log(JSON.stringify({kind:'summary',...summary}));}finally{state.close();}}
