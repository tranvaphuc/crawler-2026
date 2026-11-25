import {publicationPageKey,isReplyPublicationNode} from './newsPublicationPageIdentity.mjs';
const clean = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
const articleType = n => String(n.attr('itemtype') || '').split(/\s+/).some(v => /^https?:\/\/schema\.org\/(?:NewsArticle|Article|BlogPosting)$/.test(v));

// HTML microdata is the same original Article publication contract as JSON-LD.
// Accept only an explicit clock in the URL-bound article, never a loose meta tag.
export function ownedOriginalPublicationMicrodata($, url, title, parseDate, pageKeys = [publicationPageKey(url)], {allowDay=false}={}) {
 const canonical = $('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content');
 if (!canonical || !pageKeys.includes(publicationPageKey(canonical, url))) return [];
 const found = [];
 for (const element of $('[itemprop~="datePublished"]').toArray()) {
  const node = $(element), owner = node.closest('[itemscope]');
  if (!owner.length || !articleType(owner) || isReplyPublicationNode($, node)
   || /dateModified/.test(node.attr('itemprop') || '') || /updated|cập nhật/i.test(node.text())) continue;
  if (owner.find('h1').filter((i, e) => clean($(e).text()) === clean(title)).length !== 1) continue;
  const declarations = [owner.attr('itemid')];
  const permalink=node.closest('a[href]');if(permalink.length===1&&permalink.closest('[itemscope]')[0]===owner[0])declarations.push(permalink.attr('href'));
  owner.find('[itemprop="mainEntityOfPage"],[itemprop="url"]').each((i, e) => {
   const n = $(e), parentScope = n.is('[itemscope]') ? n.parents('[itemscope]').first() : n.closest('[itemscope]');
   if (parentScope[0] === owner[0]) declarations.push(n.attr('itemid') || n.attr('content') || n.attr('href'));
  });
  if (!declarations.some(v => v && pageKeys.includes(publicationPageKey(v, url)))) continue;
  const clocks = owner.find('[itemprop~="datePublished"]').filter((i, e) => $(e).closest('[itemscope]')[0] === owner[0] && !isReplyPublicationNode($, $(e)));
  if (clocks.length !== 1 || clocks[0] !== element) continue;
  const raw = node.attr('content') || node.attr('datetime') || clean(node.text()), date = parseDate(raw, null);
  if (!date || !['minute','second'].includes(date.precision)&&!(allowDay&&date.precision==='day')) continue;
  found.push({node:element,owner:owner[0],date,raw,url,kind:'url_bound_original_article_microdata'});
 }
 return found;
}
