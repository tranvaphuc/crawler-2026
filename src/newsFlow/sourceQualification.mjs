export function isDeclaredForumHtml(html) {
  return /<meta\b(?=[^>]*\bname=["']generator["'])(?=[^>]*\bcontent=["'][^"']*(?:XenForo|vBulletin|phpBB|Discourse|Invision|Discuz|MyBB|Simple Machines|Kunena))[^>]*>/i.test(html)
    || /<html\b[^>]*(?:id=["']XenForo["']|data-xf-init=)/i.test(html)
    || /data-template=["'](?:forum_list|forum_view|thread_view)["']/i.test(html)
    || /<body\b[^>]*class=["'][^"']*\b(?:phpbb|discourse|bbpress)\b/i.test(html)
    || /["']@type["']\s*:\s*["']DiscussionForumPosting["']/i.test(html)
    || /<(?:div|main)\b[^>]*id=["']flarum-content["']/i.test(html)
    || /data-pageapp=["']forums["']/i.test(html);
}

export function qualifyNewsSourceSamples(articles,{listingLinks=0}={}) {
  const passed=articles.filter(a=>a.state==='parsed');
  const urls=new Set(passed.map(a=>a.url));
  const hashes=new Set(passed.map(a=>a.contentHash).filter(Boolean));
  const holdouts=passed.filter(a=>a.independent);
  const reasons=[];
  if(!listingLinks)reasons.push('no_working_article_discovery_seed');
  if(urls.size<3||hashes.size<3)reasons.push('insufficient_distinct_verified_articles');
  if(new Set(holdouts.map(a=>a.url)).size<2)reasons.push('insufficient_independent_http_holdouts');
  if(passed.length>=3&&new Set(passed.map(a=>a.description)).size<3)reasons.push('generic_description_across_distinct_articles');
  return {approved:!reasons.length,reasons,passed:passed.length,holdouts:holdouts.map(a=>a.url),distinctContents:hashes.size};
}
