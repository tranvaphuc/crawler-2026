// A publication clock must not come from a linked recommendation or navigation.
export function newsDateOwnershipIssue($, node, url) {
 if (!node?.length || node.is('meta')) return null;
 if (node.closest('nav,footer,aside,related-content,[class*="related"],[class*="recommend"],.comments,.comment-list').length) return 'publication_selector_points_outside_article';
 const target = new URL(url);
 if (target.hostname.replace(/^www\./,'') === 'vtcnews.vn') {
  const eventItem = node.closest('.event-box .event-list > li');
  const link = eventItem.find('a[href]').first().attr('href');
  try {
   const linked = new URL(link, url);
   if (linked.hostname.replace(/^www\./,'') === 'vtcnews.vn' && linked.pathname !== target.pathname && /-ar\d+\.html$/.test(linked.pathname)) return 'publication_selector_points_to_other_article';
  } catch {}
 }
 for (const element of node.parents().toArray().slice(0, 3)) {
  const parent = $(element);
  if (parent.find('h1').length) break;
  // Audio/article templates may use an unlinked h2/h3 as their own headline.
  if (parent.find('h2,h3,h4').toArray().some(e => !$(e).find('a[href]').length)) break;
  const links = parent.find('h2 a[href],h3 a[href],h4 a[href]').toArray().filter(e => $(e).text().trim().length >= 12);
  if (links.length !== 1) continue;
  try {
   const linked = new URL($(links[0]).attr('href'), url);
   if (linked.hostname === target.hostname && linked.pathname !== target.pathname && !linked.hash && !/\/$/.test(linked.pathname)) return 'publication_selector_points_to_other_article';
  } catch {}
 }
 return null;
}
