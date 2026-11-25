import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {legacyNewsId,weeklyIndex} from '../src/web/newsParser.mjs';
const root=path.resolve('outputs/news-forum-research-2026-11-09');const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const summary=await read('research-summary.json'),docs=await read('pilot-antt/documents.json'),missing=await read('pilot-antt/unavailable.json'),links=await read('pilot-antt/article-links.json'),config=await read('site-configurations.json'),sites=await read('site-readiness.json'),forums=await read('forum-probes/reviewed-results.json');
assert.equal(summary.eastdataExecuted,false);assert.equal(summary.es5Written,false);assert.equal(docs.length,summary.pilot.parsed);assert.equal(docs.length+missing.length,links.length);assert.equal(summary.pilot.parserFailed,0);assert.equal(summary.pilot.failedTasks,0);assert(summary.pilot.elapsedMs<900000);
assert.equal(new Set(docs.map(d=>d._source.url)).size,docs.length);assert.equal(new Set(docs.map(d=>d._id)).size,docs.length);
const mapping=await read('master-current-mapping.json'),index=summary.identityReconciliation?Object.keys(mapping)[0]:null;const props=mapping[index].mappings.newsTopic.properties;
for(const d of docs){
 for(const f of ['title','url','content','siteId','siteName','author','authorId','publishedDate','insertedDate'])assert(d._source[f],d._source.url+' '+f);
 assert.equal(d._type,'newsTopic');assert.equal(d._index,weeklyIndex(d._source.publishedDate));assert.equal(d._id,legacyNewsId({registrableDomain:'antt.vn',title:d._source.title,identityUrl:d._source.url}));
 for(const f of Object.keys(d._source))assert(props[f],`Missing mapping for ${f}`);
 assert(d.extracted.foundOn.length>0);assert(d.extracted.bodyText||d.extracted.images.length||d.extracted.media.length);
}
const lines=(await fs.readFile(path.join(root,'pilot-antt/es5-bulk-reconciled-preview.ndjson'),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(lines.length,(summary.identityReconciliation.creates+summary.identityReconciliation.updates)*2);
for(let i=0;i<lines.length;i+=2){const action=Object.keys(lines[i])[0];assert(['create','update'].includes(action));if(action==='update'){for(const key of ['likes','comments','shares','interactions','insertedDate'])assert(!(key in lines[i+1].doc),key);}}
assert.equal(Object.keys(config).length,sites.length);assert(Object.values(config).every(c=>c.enabled===false));assert.equal(new Set(forums.map(f=>f.domain)).size,49);assert.equal(forums.length,49);
for(const f of forums.filter(f=>f.articleParseVerified)){const p=await read('forum-probes/'+f.parsedSampleFile);assert(p.completeRequiredFields);assert(p.parsedPosts.every(p=>p.author&&p.publishedDate&&p.content&&p.url&&p.nativePostId));}
const agg=await read('aggregation-results.json');assert.equal(agg.timed_out,false);assert.equal(agg._shards.failed,0);for(const t of agg.aggregations.by_type.buckets){assert.equal(t.sites.sum_other_doc_count,0);assert.equal(t.sites.doc_count_error_upper_bound,0);}
const report={validatedAt:new Date().toISOString(),passed:true,documents:docs.length,unavailable:missing.length,roundResolved:links.length,configurations:Object.keys(config).length,forumSites:forums.length,bulkOperations:lines.length/2,allSourcesSlaVerified:false};await fs.writeFile(path.join(root,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
