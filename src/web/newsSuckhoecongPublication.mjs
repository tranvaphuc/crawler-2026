const selector = 'section.box-author .info-author > ul > li:first-child';
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const samePage = (raw, url) => {
  try { const a = new URL(raw, url), b = new URL(url); return a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '') && a.pathname === b.pathname && a.search === b.search; } catch { return false; }
};

// The user explicitly confirmed UTC+7 for this publisher on 2026-11-16.
// This authority is separate from its RSS, which mislabels local clocks GMT.
// Accept only the clock next to this article's own H1 and URL-bound share widget.
export function verifiedSuckhoecongClock($, url, config, node, title) {
  if (new URL(url).hostname.replace(/^www\./, '') !== 'suckhoecong.vn'
    || config.siteName !== 'suckhoecong.vn' || config.timezone !== 'Asia/Ho_Chi_Minh'
    || config.publicationTimePolicy !== 'user_confirmed_suckhoecong_utc_plus_7'
    || config.publicationEvidencePolicy?.kind !== 'suckhoecong_owned_local_clock_v1'
    || config.publishedDate?.strategy !== 'selector' || config.publishedDate.selector !== selector
    || config.publishedDate.attribute || config.publishedDate.index) return false;
  if ($(selector).length !== 1 || !node?.is(selector)) return false;
  const box = node.closest('section.box-author');
  if (box.length !== 1 || box.find('h1').length !== 1 || clean(box.find('h1').text()) !== clean(title)) return false;
  if (node.parents('aside,nav,footer,[class*="related"],[class*="recommend"]').length) return false;
  if (!/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(clean(node.text()))) return false;
  const canonical = $('link[rel="canonical"]').attr('href');
  const shares = box.find('.info-author .fb-like[data-href]');
  return !!canonical && samePage(canonical, url) && shares.length === 1 && samePage(shares.attr('data-href'), url);
}
