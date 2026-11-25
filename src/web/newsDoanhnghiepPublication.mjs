const selector = '.header-single .header-meta > .row > div:first-child';
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const samePage = (raw, url) => {
 try { const a = new URL(raw, url), b = new URL(url); return a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '') && a.pathname === b.pathname && a.search === b.search; } catch { return false; }
};

// This publisher uses an H2 and a print container instead of semantic Article markup.
// Require the explicit original GMT+7 clock, native headline, body and share URL together.
export function verifiedDoanhnghiepClock($, url, config, node, title) {
 if (new URL(url).hostname.replace(/^www\./, '') !== 'doanhnghiepvathuongmai.vn'
  || config.siteName !== 'doanhnghiepvathuongmai.vn'
  || config.publicationEvidencePolicy?.kind !== 'doanhnghiep_owned_explicit_clock_v1'
  || config.publishedDate?.strategy !== 'selector' || config.publishedDate.selector !== selector
  || config.publishedDate.attribute || config.publishedDate.index
  || $(selector).length !== 1 || !node?.is(selector)) return false;
 const root = node.closest('#printSingle'), header = node.closest('.header-single');
 if ($('#printSingle').length !== 1 || root.length !== 1 || header.length !== 1
  || header.find('h2').length !== 1 || clean(header.find('h2').text()) !== clean(title)
  || root.find('.entry-content').length !== 1) return false;
 if (!/^Đăng ngày:\s*\d{2}\/\d{2}\/\d{4}\s*,\s*\d{2}:\d{2}\s*GMT\+7$/.test(clean(node.text()))) return false;
 const clocks = header.find('.header-meta > .row > div').filter((i, e) => /^Đăng ngày:/.test(clean($(e).text())));
 if (clocks.length !== 1 || clocks[0] !== node[0]) return false;
 const canonical = $('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content'), share = header.find('.post-share a[data-href][onclick]');
 return !!canonical && samePage(canonical, url) && share.length === 1 && samePage(share.attr('data-href'), url);
}
