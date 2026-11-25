import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {collectDiscoveryHealth} from '../src/newsFlow/discoveryHealth.mjs';
import {registerOriginalSources} from '../src/newsFlow/baomoiOriginalBranch.mjs';
const output=process.argv[2]||'/var/lib/news-flow/discovery-health/latest.json';
const registry=await loadNewsRegistry(),db=new DatabaseSync(process.env.NEWS_STATE||'/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});
try {
 registerOriginalSources(db,registry);
 const started=performance.now(),report=collectDiscoveryHealth(db,registry.sources.values());
 let previous=null;try{previous=JSON.parse(await fs.readFile(output,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const known=new Set((previous?.sites||[]).flatMap(s=>s.alerts.map(a=>s.site+'|'+a)));
 report.newAlerts=report.sites.flatMap(s=>s.alerts.filter(a=>!known.has(s.site+'|'+a)).map(alert=>({site:s.site,alert})));
 report.elapsedMs=Math.round(performance.now()-started);
 await fs.mkdir(path.dirname(output),{recursive:true});const temporary=output+'.'+process.pid+'.tmp';await fs.writeFile(temporary,JSON.stringify(report,null,2)+'\n',{mode:0o640});await fs.rename(temporary,output);
 console.log(JSON.stringify({event:report.alertSites?'discovery_health_warning':'discovery_health_ok',checkedAt:report.checkedAt,totalSites:report.totalSites,alertSites:report.alertSites,counts:report.counts,newAlerts:report.newAlerts,elapsedMs:report.elapsedMs,output}));
}finally{db.close();}
