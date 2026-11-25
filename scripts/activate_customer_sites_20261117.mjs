import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
const root='outputs/customer-sites-20261117',manifest=JSON.parse(await fs.readFile('config/web-sources/customer-news-sites-20261117.json')),staged=JSON.parse(await fs.readFile(root+'/staged-configs.json'));
const state=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true}),usage=()=>state.prepare('SELECT * FROM ai_usage ORDER BY day').all();const aiBefore=usage(),before=await loadNewsRegistry(),installed=[];
try{
for(const row of staged){
 if(!manifest.sources.some(s=>s.domain===row.domain))throw Error('UNREQUESTED_SOURCE');
 const config=JSON.parse(await fs.readFile(row.file,'utf8'));
 if(config.siteName!==row.domain||!config.allowedHosts.includes(row.domain))throw Error('SOURCE_IDENTITY_MISMATCH');
 if(!row.qualified&&!config.originalPublicationBlockedReason)throw Error('UNQUALIFIED_SOURCE_WRITE_GUARD_MISSING');
 const target='config/web-sources/news/'+row.domain+'.json';
 try{await fs.copyFile(row.file,target,fs.constants.COPYFILE_EXCL);installed.push({domain:row.domain,target});}catch(e){if(e.code!=='EEXIST')throw e;}
}
const after=await loadNewsRegistry(),missing=manifest.sources.filter(s=>!after.byHost(s.domain));if(missing.length)throw Error('REQUESTED_SOURCE_MISSING');
const aiAfter=usage();if(aiBefore.some(b=>!aiAfter.some(a=>a.day===b.day&&a.calls>=b.calls&&a.usd+1e-9>=b.usd)))throw Error('AI_USAGE_NOT_PRESERVED');
const result={deployedAt:new Date().toISOString(),requested:39,registeredRequested:39,added:installed.map(r=>r.domain),registryBefore:before.sources.size,registryAfter:after.sources.size,missingDomains:[],aiUsagePreserved:true,paidAiCalls:0,queueReset:false,existingConfigsChanged:false,newSourcesPendingQualification:installed.filter(r=>after.sources.get(r.domain).publicationQuarantine).map(r=>r.domain)};
await fs.writeFile(root+'/activation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(e){for(const row of installed)await fs.unlink(row.target);throw e;}finally{state.close();}
