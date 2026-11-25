import {NewsProcessor} from './processor.mjs';
import {discoverNewsLinks} from '../web/configurableNewsParser.mjs';
export class ThreeFlowProcessor extends NewsProcessor{
 links(task,html,url,source,priority,discovered=null){
  if(!this.expand||task.role==='article'&&!this.admitRelated)return 0;
  const found=discovered||discoverNewsLinks(html,url,{domain:source.domain,allowedHosts:source.config.allowedHosts,knownArticleUrls:source.config.validation?.sampleUrls,knownCategoryUrls:source.seeds,legacy:{legacyArticlePattern:source.config.discovery?.legacyArticlePattern}});
  // Historical URL formats are discovery hints, not an exhaustive allowlist.
  // Publishers change URL layouts; explicit restrictions must be declared separately.
  const format=source.config.discovery?.requiredArticlePattern;
  const pattern=format?new RegExp(format,'i'):null;
  return super.links(task,html,url,source,priority,{...found,articles:pattern?found.articles.filter(a=>pattern.test(a.url)):found.articles});
 }
}
