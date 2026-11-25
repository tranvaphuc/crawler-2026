import fs from 'node:fs/promises';import path from 'node:path';
import {parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';import {loadNewsDateContext} from '../src/web/newsDateContext.mjs';
const root=path.resolve('outputs/news-parser-rollout-2026-11-09'),read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const rows=(await read(path.join(root,'reviewed-results.json'))).filter(r=>['parser_samples_passed','parser_passed_category_unverified'].includes(r.status));let checked=0;const changed=[];
for(const r of rows){const dir=path.join(root,'sites',r.domain),config=await read(path.join(dir,'config.json')),context=await loadNewsDateContext(dir),samples=await read(path.join(dir,'reviewed-samples.json'));
 for(const s of samples.filter(s=>s.parsed&&s.htmlFile)){const actual=parseConfiguredArticle(await fs.readFile(path.join(dir,s.htmlFile),'utf8'),s.url,config,context);checked++;
  const fields=actual.error?['error:'+actual.error]:['_id','_index'].filter(k=>actual[k]!==s.parsed[k]).concat(['title','content','publishedDate'].filter(k=>actual._source[k]!==s.parsed._source[k]));
  if(!actual.error&&JSON.stringify(actual.extracted.media)!==JSON.stringify(s.parsed.extracted.media))fields.push('media');
  if(fields.length)changed.push({domain:r.domain,url:s.url,fields});
 }
 if(checked%200<8)console.log(JSON.stringify({checked,changed:changed.length}));
}
await fs.writeFile(process.argv.includes('--output-file')?path.resolve(process.argv[process.argv.indexOf('--output-file')+1]):path.join(root,'round3','frozen-audit.json'),JSON.stringify({checked,changed,domains:[...new Set(changed.map(x=>x.domain))]},null,2));console.log(JSON.stringify({checked,changed:changed.length,domains:[...new Set(changed.map(x=>x.domain))]}));
