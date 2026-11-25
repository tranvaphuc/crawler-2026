"""Build only the category-discovery delta against the fetched VPS baseline."""
import json,hashlib
from pathlib import Path
root=Path('outputs/news-category-coverage-20261123');changes=[]
def edit(file,operations):
 before=(root/'baseline'/Path(file).name).read_text(encoding='utf-8');after=before
 for old,new in operations:
  if after.count(old)!=1:raise RuntimeError('PATCH_ANCHOR_NOT_UNIQUE:'+file+':'+old[:60])
  after=after.replace(old,new,1)
 changes.append({'path':file,'beforeSha':hashlib.sha256(before.encode()).hexdigest(),'after':after})
local=Path('src/newsFlow/threeFlowState.mjs').read_text(encoding='utf-8')
method=local[local.index(' rememberCategoryHints('):local.index(' rememberFullPublicationFeed(')]
schema=local[local.index(' CREATE TABLE IF NOT EXISTS news_category_hints'):local.index(' CREATE INDEX IF NOT EXISTS news_requests_fetching')]
edit('src/newsFlow/threeFlowState.mjs',[
 ("const seedNextRoundReasons=", "import {categoryUrl} from './categoryCoverage.mjs';\nconst seedNextRoundReasons="),
 ('export class ThreeFlowState extends NewsState {\n','export class ThreeFlowState extends NewsState {\n'+method),
 (' CREATE INDEX IF NOT EXISTS news_requests_fetching',schema+' CREATE INDEX IF NOT EXISTS news_requests_fetching'),
 ('configureSites(sources){const values=[...sources];super.configureSites(values);',local[local.index('configureSites(sources){'):local.index('super.configureSites(values);')+len('super.configureSites(values);')]),
 (next(l for l in (root/'baseline'/'threeFlowState.mjs').read_text(encoding='utf-8').splitlines() if l.startswith(' offer(doc,')),next(l for l in local.splitlines() if l.startswith(' offer(doc,')))])
edit('src/newsFlow/seedLinksWorker.mjs',[("result={articles:found.articles,...(kind?", "result={articles:found.articles,...(!input.article?{categories:found.categories||[]}:{}),...(kind?")])
edit('src/newsFlow/processor.mjs',[
 (next(l for l in (root/'baseline'/'processor.mjs').read_text(encoding='utf-8').splitlines() if l.startswith('  let known=this.seedKeyCache')),next(l for l in Path('src/newsFlow/processor.mjs').read_text(encoding='utf-8').splitlines() if l.startswith('  let cached=this.seedKeyCache'))),
 ("this.state.enqueueBatch(task.cycle,urls,source.domain,'article',task.url,priority);","if(task.role==='seed'&&found.categories?.length)this.state.rememberCategoryHints?.(source,found.categories,url);this.state.enqueueBatch(task.cycle,urls,source.domain,'article',task.url,priority);"),
 ("  if(issues.length)return this.hold(task,'NEWS_FIELD_VERIFICATION_FAILED',{issues});", "  if(issues.length)return this.hold(task,'NEWS_FIELD_VERIFICATION_FAILED',{issues});\n  if(audit.sectionHints?.length&&this.state.rememberCategoryHints)await (this.state.writeAsync?this.state.writeAsync(()=>this.state.rememberCategoryHints(owner,audit.sectionHints,url)):this.state.rememberCategoryHints(owner,audit.sectionHints,url));")])
edit('src/web/newsDeepAuditWorker.mjs',[
 ("import {publicationHeadlinesMatch}","import {publisherBreadcrumbCategories} from '../newsFlow/categoryCoverage.mjs';\nimport {publicationHeadlinesMatch}"),
 (" parentPort.postMessage({workerExecutionMs:"," const sectionHints=parsed&&!error?publisherBreadcrumbCategories($,sample.url,{domain:sample.domain,config}):[];\n parentPort.postMessage({workerExecutionMs:"),
 ('evidence,proposal,articleLinksPolicy:','evidence,proposal,sectionHints,articleLinksPolicy:')])
(root/'runtime-patch.json').write_text(json.dumps(changes),encoding='utf-8')
print(json.dumps({'files':len(changes),'patch':str(root/'runtime-patch.json')}))
