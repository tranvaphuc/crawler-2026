import {cnnLitePublicAccessProof} from './newsCnnLite.mjs';
const clean = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
export function publicationPageKey(raw, base) {
 try { const u = new URL(raw, base); if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null; u.hash = ''; for (const k of [...u.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(k)) u.searchParams.delete(k); u.searchParams.sort(); return u.hostname.replace(/^www\./, '') + (u.pathname.replace(/\/$/, '') || '/') + u.search; } catch { return null; }
}
const articleUrls = a => [a.url, a.mainEntityOfPage?.['@id'], !a.url && !a.mainEntityOfPage?.['@id'] ? a.mainEntityOfPage?.url : null, typeof a.mainEntityOfPage === 'string' ? a.mainEntityOfPage : null, a['@id']].filter(Boolean);
export function publicationHeadlinesMatch($, schemaTitle, nativeTitle, article = {}) {
 const norm = v => clean($('<textarea>').html(String(v||'')).text()).replace(/[\u2018\u2019\u201a\u201b]/g,"'").replace(/[\u201c\u201d\u201e\u201f]/g,'"').replace(/\s*([:;,!?])\s*/g,'$1 ').trim().toLocaleLowerCase();
 const a = norm(schemaTitle), b = norm(nativeTitle); if (a === b) return true;
 const brands = [$('meta[property="og:site_name"]').attr('content'), article.publisher?.name].map(norm).filter(Boolean);
 if (brands.some(brand => [' | ', ' - ', ' – ', ' — '].some(sep => a === b + sep + brand))) return true;
 // QDND exposes a shorter SEO headline in JSON-LD/OG while its description
 // repeats the full visible headline. Require all three self-article bindings.
 if(article['@type']==='NewsArticle'&&norm(article.description)===b&&a&&
  norm($('head meta[property="og:title"]').attr('content'))===a){
  const own=articleUrls(article).filter(raw=>{try{const u=new URL(raw);return u.hostname.replace(/^www\./,'')==='qdnd.vn'&&/\/[^/?]+-\d{6,}$/.test(u.pathname)&&!u.search&&!u.hash;}catch{return false;}});
  const heading=$('.article-detail > h1');
  if(own.length&&heading.length===1&&norm(heading.text())===b&&$('h1').length===1&&
   own.some(raw=>publicationPageKey(raw)===publicationPageKey($('head meta[property="og:url"]').attr('content'))))return true;
 }
 if ([100,110].includes(a.length) && b.startsWith(a) && articleUrls(article).some(raw => {try{return new URL(raw).hostname.replace(/^www\./,'')==='ad-hoc-news.de';}catch{return false;}})) return true;
 if (article['@type'] === 'DiscussionForumPosting') {
  const h = $('.p-title-value'); if (h.length !== 1 || norm(h.text()) !== b) return false;
  return norm(h.clone().find('.label,.label-append').remove().end().text()) === a;
 }
 return false;
}

// Publisher-specific URL representations, with positive self-article evidence.
// An external canonical alone never establishes which article was downloaded.
export function verifiedPublicationPageIdentity($, url, config, parsed, articles, parseDate) {
 const p = parsed._source, target = publicationPageKey(url), title = clean(p.title);
 const canonical = $('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content');
 if (!canonical || publicationPageKey(canonical, url) === target) return null;
 const access=cnnLitePublicAccessProof($,url,config);if(access)return {kind:'cnn_lite_canonical_v1',keys:[publicationPageKey(url),publicationPageKey(access.canonicalUrl)],declaredCanonical:access.canonicalUrl,canonicalIsAttribution:false,preserveRequestedIdentity:true};
 const requested = new URL(url), declared = new URL(canonical, url), domain = requested.hostname.replace(/^www\./, '');
 const heading = $('h1').filter((i,e) => clean($(e).text()) === title);
 if(domain==='24hmoney.vn'&&config.siteName===domain&&config.pageIdentityPolicy==='24hmoney_social_attribution_v1'
  &&declared.hostname.replace(/^www\./,'')===domain&&/^https?:$/.test(declared.protocol)&&!declared.username&&!declared.password&&!declared.hash
  &&/^\/news\/[^/]+-c\d+a\d+\.html$/.test(requested.pathname)&&requested.pathname===declared.pathname
  &&requested.searchParams.getAll('from_source').length===1&&requested.searchParams.get('from_source')==='social'
  &&heading.length===1&&$('h1').length===1){
  const native=new URL(requested);native.searchParams.delete('from_source');
  const canonicalKey=publicationPageKey(declared.href);
  if(publicationPageKey(native.href)===canonicalKey&&publicationPageKey($('meta[property="og:url"]').attr('content'),url)===canonicalKey
   &&articles.some(a=>/^(?:NewsArticle|Article)$/.test(a['@type'])&&!a.datePublishedFallbackUpload&&publicationHeadlinesMatch($,a.headline,title,a)&&articleUrls(a).some(raw=>publicationPageKey(raw,url)===canonicalKey)))
   return {kind:'24hmoney_social_attribution_v1',keys:[target,canonicalKey],declaredCanonical:declared.href,canonicalIsAttribution:false};
 }
 if(domain==='baotintuc.vn'&&config.siteName===domain&&declared.origin==='https://video.baotintuc.vn'&&
  requested.pathname===declared.pathname&&/^\/[^/]+-post\d{7,}\.html$/.test(requested.pathname)&&
  !requested.search&&!declared.search&&!declared.hash&&heading.length===1&&
  publicationPageKey($('meta[property="og:url"]').attr('content'),url)===target){
  const keys=[target,publicationPageKey(declared.href)];
  const dates=articles.filter(a=>!a.datePublishedFallbackUpload&&publicationHeadlinesMatch($,a.headline,title,a)&&articleUrls(a).some(raw=>keys.includes(publicationPageKey(raw,url))))
   .map(a=>parseDate(a.datePublished,null)).filter(Boolean);
  const metadata=parseDate($('head meta[property="article:published_time"]').attr('content'),null);
  if(metadata?.iso===p.publishedDate&&dates.length&&dates.every(clock=>clock.iso===p.publishedDate))return {kind:'baotintuc_video_canonical_v1',keys,declaredCanonical:declared.href,canonicalIsAttribution:false};
 }
 if(domain==='businesstimes.com.sg'&&config.siteName===domain&&config.pageIdentityPolicy==='business_times_ref_article_alias'
  &&declared.hostname.replace(/^www\./,'')===domain&&requested.pathname===declared.pathname&&!declared.search
  &&requested.searchParams.size===1&&heading.length===1){
  const ref=requested.searchParams.get('ref'),feedAlias=requested.searchParams.get('ai-allowed')==='1';
  if(!feedAlias&&!(ref&&/^[a-z0-9-]{1,100}$/i.test(ref)))return null;
  const own=articles.filter(a=>a.isAccessibleForFree===true&&/^(?:NewsArticle|Article)$/.test(String(a['@type']))&&publicationHeadlinesMatch($,a.headline,title,a)&&articleUrls(a).some(raw=>publicationPageKey(raw,url)===publicationPageKey(canonical,url)));
  const clocks=own.map(a=>parseDate(a.datePublished,null)).filter(Boolean);
  if(own.length===1&&clocks.length===1&&clocks[0].iso===p.publishedDate)return {kind:feedAlias?'business_times_feed_article_alias_v1':'business_times_ref_article_alias_v1',keys:[target,publicationPageKey(canonical,url)],declaredCanonical:declared.href,canonicalIsAttribution:false};
 }
 if(domain==='sbv.gov.vn'&&config.siteName===domain&&config.pageIdentityPolicy==='sbv_vietnamese_locale_article_alias'
  &&declared.hostname===domain&&/^\/(?:vi\/)?w\/[^/?#]+$/.test(requested.pathname)&&declared.pathname===requested.pathname.replace(/^\/(?:vi\/)?w\//,'/vi/w/')&&!declared.search
  &&(!requested.search||requested.searchParams.size===1&&requested.searchParams.getAll('redirect').length===1&&/^\/vi\/(?:tin-tuc-su-kien|trang-chu)$/.test(requested.searchParams.get('redirect')))
  &&heading.length===1&&heading.parent().is('#print-content')&&$('#print-content > .article-content').length===1&&$('#print-content time.author-time[datetime]').length===1){
  const clock=parseDate($('#print-content time.author-time').attr('datetime'),config.timezone,config.dateOrder,config.clockFormat);
  if(clock&&clock.iso===p.publishedDate)return {kind:'sbv_vietnamese_locale_article_alias_v1',keys:[target,publicationPageKey(canonical,url)],declaredCanonical:declared.href,canonicalIsAttribution:false};
 }
 if(domain==='baoninhbinh.org.vn'&&config.siteName===domain&&config.pageIdentityPolicy==='ninhbinh_legacy_canonical_alias_v1'&&heading.length===1&&heading.is('h1.header-title')&&$('.content-detail').length===1&&declared.hostname===domain&&!requested.search&&!declared.search&&publicationPageKey($('meta[property="og:url"]').attr('content'),url)===publicationPageKey(canonical,url)){
  const a=requested.pathname.match(/^\/([a-z0-9-]+)-(\d{6}|\d{17})\.html$/),b=declared.pathname.match(/^\/([a-z0-9-]+?)(?:-|\/d)(\d{6}|\d{17})\.htm$/),clock=$('h1.header-title + div');
  if(a&&b&&a[2]===b[2]&&b[1].length>=30&&(a[1]===b[1]||a[1].startsWith(b[1]+'-'))&&publicationHeadlinesMatch($,$('meta[property="og:title"]').attr('content'),title)&&clock.length===1){
   const original=parseDate(clean(clock.text()),config.timezone,config.dateOrder,config.clockFormat);
   if(original&&Number.isFinite(Date.parse(p.publishedDate))&&Math.floor(Date.parse(original.iso)/60000)===Math.floor(Date.parse(p.publishedDate)/60000))return {kind:'ninhbinh_legacy_canonical_alias_v1',keys:[target,publicationPageKey(canonical,url)],declaredCanonical:declared.href,canonicalIsAttribution:false};
  }
 }
 if(domain==='hungyentv.vn'&&config.siteName===domain&&config.pageIdentityPolicy==='hungyen_article_path_alias_v1'&&heading.length===1&&heading.closest('.boxheading').length===1&&$('.boxcontent').length===1&&$('.boxheading .datetimes').length===1){
  const parts=u=>{const p=u.pathname.split('/').filter(Boolean);if(p[0]!=='news'||![3,4].includes(p.length)||!/^\d{4,}$/.test(p.at(-2))||p.length===4&&!/^\d+$/.test(p[1]))return null;return {id:p.at(-2),slug:p.at(-1)};},a=parts(requested),b=parts(declared);
  if(a&&b&&a.id===b.id&&a.slug===b.slug&&declared.hostname.replace(/^www\./,'')===domain&&!requested.search&&!declared.search&&publicationPageKey($('meta[property="og:url"]').attr('content'),url)===publicationPageKey(declared.href))return {kind:'hungyen_article_path_alias_v1',keys:[target,publicationPageKey(declared.href)],declaredCanonical:declared.href,canonicalIsAttribution:false};
 }
 if(domain==='thanhtra.gov.vn'&&config.siteName===domain&&config.pageIdentityPolicy==='thanhtra_liferay_article_identity'&&heading.length===1&&heading.closest('.article-page-container.chitiet').length===1){
  const prefixes=['tjku','tlfm'].map(id=>'_portal_cms_tintuc_PortalCmsTintucPortlet_INSTANCE_'+id+'_').filter(prefix=>requested.searchParams.has(prefix+'baiVietId'));if(prefixes.length!==1)return null;const prefix=prefixes[0],idInput=$('input[name="'+prefix+'articleId"]'),urlInput=$('input[name="'+prefix+'articleURL"]'),id=requested.searchParams.getAll(prefix+'baiVietId');
  if(idInput.length===1&&urlInput.length===1&&id.length===1&&/^\d{4,}$/.test(id[0])&&idInput.attr('value')===id[0])try{
   const native=new URL(urlInput.attr('value')),normalized=new URL(requested);normalized.pathname=normalized.pathname.replace(/^\/web\/guest(?=\/)/,'');
   if(native.hostname===domain&&/^https?:$/.test(native.protocol)&&!native.username&&!native.password&&native.searchParams.getAll(prefix+'baiVietId').length===1&&native.searchParams.get(prefix+'baiVietId')===id[0]&&publicationPageKey(normalized.href)===publicationPageKey(native.href)&&declared.hostname===domain&&declared.pathname===native.pathname&&!declared.search)
    return {kind:'thanhtra_liferay_article_identity_v1',keys:[target,publicationPageKey(native.href),publicationPageKey(canonical,url)],declaredCanonical:native.href,canonicalIsAttribution:false};
  }catch{}
 }

 if(domain==='kinhtexahoi.vn'&&config.siteName===domain&&config.pageIdentityPolicy==='kinhtexahoi_empty_authority_canonical'
  &&canonical==='https://'+requested.pathname+requested.search&&publicationPageKey($('meta[property="og:url"]').attr('content'),url)===target
  &&heading.length===1&&heading.closest('.newdetailscontent').length===1&&/\_t\d+c\d+n\d+$/.test(requested.pathname))
  return {kind:'kinhtexahoi_empty_authority_canonical_v1',keys:[target,publicationPageKey(canonical,url)],declaredCanonical:requested.href,canonicalIsAttribution:false};
 if(domain==='dzogame.vn'&&config.siteName===domain&&config.pageIdentityPolicy==='dzogame_quoted_slug_alias'&&declared.hostname.replace(/^www\./,'')===domain&&requested.search===declared.search){
  const decode=u=>{try{const path=decodeURIComponent(u.pathname);return /[?#\\]/.test(path)?null:path.normalize('NFC');}catch{return null;}},a=decode(requested),b=decode(declared),h=$('#MainContent_tilte_post > .titleWrapper2');
  if(a&&b&&(/[“”]/.test(a)||/-[–—]-/.test(a))&&a.replace(/[“”]/g,'').replace(/-[–—]-/g,'-')===b&&/-\d{4,}-\d+\.html$/.test(a)&&h.length===1&&clean(h.text())===title&&h.closest('.postWrapper').length===1&&publicationHeadlinesMatch($,$('meta[property="og:title"]').attr('content'),title))
   return {kind:'dzogame_quoted_slug_alias_v1',keys:[target,publicationPageKey(canonical,url)],declaredCanonical:declared.href,canonicalIsAttribution:false};
 }

 if(domain==='asemconnectvietnam.gov.vn'&&config.siteName===domain&&config.pageIdentityPolicy==='asem_original_article_query_alias'
  &&requested.pathname.toLowerCase()==='/default.aspx'&&declared.pathname.toLowerCase()==='/default.aspx'&&declared.hostname.replace(/^www\./,'')===domain){
  const params=u=>{const out=new Map();for(const [k,v]of u.searchParams){const name=k.toLowerCase();if(/^utm_|^(fbclid|gclid)$/i.test(name))continue;if(out.has(name)||!['id1','id8','zid1'].includes(name))return null;out.set(name,v);}return out;},a=params(requested),b=params(declared),h=$('h3').filter((i,e)=>clean($(e).text())===title);
  if(a&&b&&/^\d{4,}$/.test(a.get('id8')||'')&&a.get('id8')===b.get('id8')&&b.has('id1')&&(!a.has('id1')||a.get('id1')===b.get('id1'))&&h.length===1&&h.closest('.panel-body').length===1)
   return {kind:'asem_original_article_query_alias_v1',keys:[target,publicationPageKey(canonical,url)],declaredCanonical:declared.href,canonicalIsAttribution:false};
 }

 // This publisher's template advertises an unimplemented /index.html route.
 // Only this exact same-ID/same-slug transformation is a known template defect.
 if(domain==='vccinews.com'&&config.siteName===domain&&config.pageIdentityPolicy==='vcci_erroneous_index_og'&&!$('link[rel="canonical"]').length
  &&/^\/(?:news|prode)\/\d+\/[^/]+\.html$/.test(requested.pathname)&&declared.hostname.replace(/^www\./,'')===domain
  &&declared.pathname===requested.pathname.slice(0,-5)+'/index.html'&&declared.search===requested.search&&heading.length===1){
  const root=$('.detail-blog-page');if(root.length===1&&heading.parents().toArray().includes(root[0])&&root.find('.time').length===1)
   return {kind:'vcci_erroneous_index_og_v1',keys:[target,publicationPageKey(canonical,url)],declaredCanonical:requested.href,canonicalIsAttribution:false};
 }
 if (config.siteName !== domain || !publicationPageKey(canonical, url) || heading.length !== 1) return null;
 const keys = [target]; let kind;
 if (domain === 'saigonbiz.com' && declared.hostname.replace(/^www\./,'') === domain && requested.search === declared.search) {
  const unicodePath = u => {try{return u.pathname.split('/').map(p=>{const d=decodeURIComponent(p);if(/[/?#\\]/.test(d))throw Error('reserved');return d.normalize('NFC');}).join('/').replace(/\/$/,'');}catch{return null;}};
  const a=unicodePath(requested),b=unicodePath(declared);
  if(a&&a===b)return {kind:'same_publisher_unicode_slug_alias_v1',keys:[target,publicationPageKey(canonical,url)],declaredCanonical:declared.href,canonicalIsAttribution:false};
 }
 const nativeIds = {'vnexpress.net': /-(\d{7,})\.html$/, 'nguoidothi.net.vn': /-(\d{4,})\.html$/, 'vov.vn': /-(?:post)?(\d{5,})\.vov$/};
 if (nativeIds[domain]) {
  const a = requested.pathname.match(nativeIds[domain]), b = declared.pathname.match(nativeIds[domain]);
  const og = $('meta[property="og:url"]').attr('content');
  if (!a || !b || a[1] !== b[1] || declared.hostname.replace(/^www\./, '') !== domain
   || requested.search !== declared.search || og && publicationPageKey(og,url) !== publicationPageKey(canonical,url)) return null;
  return {kind:'same_publisher_native_id_slug_alias_v1', keys:[target,publicationPageKey(canonical,url)], declaredCanonical:declared.href, canonicalIsAttribution:false};
 }
 if (domain === 'yahoo.com') {
  if (!/^\/news\/.+\.html$/.test(requested.pathname) || declared.hostname.replace(/^www\./, '') === domain) return null;
  kind = 'yahoo_syndicated_self_article_v1';
 } else if (domain === 'ad-hoc-news.de') {
  const parts = requested.pathname.split('/').filter(Boolean), id = parts.at(-1);
  const collapsed = '/' + parts.filter((v, i) => !i || v !== parts[i - 1]).join('/');
  if (declared.hostname.replace(/^www\./, '') !== domain || !/^\d{6,}$/.test(id || '')
   || declared.pathname.replace(/\/$/, '') !== collapsed || requested.search !== declared.search) return null;
  keys.push(publicationPageKey(canonical, url)); kind = 'ad_hoc_duplicate_category_self_article_v1';
 } else return null;
 const own = articles.filter(a => !a.datePublishedFallbackUpload && /^(?:NewsArticle|Article|BlogPosting)$/.test(String(a['@type']))
  && publicationHeadlinesMatch($,a.headline,title,a) && articleUrls(a).some(u => keys.includes(publicationPageKey(u, url))));
 const dates = own.map(a => parseDate(a.datePublished, null)).filter(Boolean);
 if (!dates.length || dates.some(d => Date.parse(d.iso) !== Date.parse(p.publishedDate))) return null;
 if (domain === 'yahoo.com') {
  const clocks = $('time[datetime]').filter((i, e) => !$(e).parents('aside,nav,footer,[class*="comment" i],[class*="related" i]').length);
  if (clocks.length !== 1) return null;
  const native = parseDate(clocks.attr('datetime'), null);
  if (!native || Date.parse(native.iso) !== Date.parse(p.publishedDate)) return null;
 }
 return {kind, keys, declaredCanonical: declared.href, canonicalIsAttribution: domain === 'yahoo.com'};
}

export function isReplyPublicationNode($, node) {
 for (const element of node.add(node.parents()).toArray()) {
  const n = $(element); if (n.is('body,html')) continue;
  if (String(n.attr('class') || '').split(/\s+/).some(c => /^(?:comment(?:s|ing)?(?:[-_]|$)|message--post$)/i.test(c))
   || n.attr('itemprop') === 'comment') return true;
 }
 return false;
}
