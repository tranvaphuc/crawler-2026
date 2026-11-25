import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {verifyNewsFields} from '../src/web/newsFieldVerification.mjs';
import {toEs5News} from '../src/newsFlow/identity.mjs';
const root='outputs/news-site-errors-2026-11-13',registry=await loadNewsRegistry(),pool=new NewsRepairPool(2,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
try{
 const domain='dongvon.doanhnhanvn.vn',p=`${root}/repair-${domain}.json`,r=JSON.parse(await fs.readFile(p));
 for(const a of r.articles){const html=gunzipSync(await fs.readFile(a.htmlPath)).toString(),v=await pool.run({sample:{domain,url:a.url,html,kind:'article'},config:registry.sources.get(domain).config});a.error=v.error;a.quality=v.quality;a.fields=v.parsed?verifyNewsFields(html,v.parsed):null;delete a.intakeError;a.dtoValid=false;if(v.parsed){try{toEs5News(v.parsed,registry.sources.get(domain).config);a.dtoValid=true;}catch(e){a.intakeError=e.code||e.message;}a.preview={...a.preview,publishedDate:v.parsed._source.publishedDate,rawDate:v.parsed.extracted.dateEvidence};}a.passed=!a.error&&a.dtoValid&&!a.quality?.length&&!a.fields?.issues?.length;}
 r.passed=r.articles.length===3&&r.articles.every(a=>a.passed);await fs.writeFile(p,JSON.stringify(r,null,2));if(!r.passed)throw Error('DONGVON_HOLDOUT_FAILED');
 const domains=['dongvon.doanhnhanvn.vn','kinhtenongthon.vn','cohoigiaothuong.vn','huongsenviet.com','nghetinhplus.vn','bantinsang.net','tv.nguoiduatin.vn','finance.yahoo.com'];
 for(const domain of [...domains,'advertisingvietnam.com']){const ads=domain==='advertisingvietnam.com',r=JSON.parse(await fs.readFile(`${root}/${ads?'ads-cache-proof':`repair-${domain}`}.json`)),articles=ads?r:r.articles;if(articles.length<3||!articles.every(a=>a.passed))throw Error('UNVERIFIED_CONFIG_'+domain);const p=`config/web-sources/news/${domain}.json`,c=JSON.parse(await fs.readFile(p));c.stage=ads?'runtime_cached_http_holdouts_passed':'runtime_http_holdouts_passed';c.runtimeValidation={checkedAt:new Date().toISOString(),passedSamples:articles.length,independentUrls:articles.map(a=>a.url),evidence:ads?'previously_fetched_public_http_html':'proxy_http_and_native_fields',fullSiteCycleVerified:false};await fs.writeFile(p,JSON.stringify(c,null,2)+'\n');console.log(JSON.stringify({domain,passed:articles.length,mode:c.runtimeValidation.evidence}));}
}finally{await pool.close();}
