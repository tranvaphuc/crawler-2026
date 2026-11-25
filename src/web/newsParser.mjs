import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
export const md5Legacy = text => crypto.createHash('md5').update(String(text), 'latin1').digest('hex');
export function legacyNewsId({registrableDomain, title, identityUrl}) {
  if (!registrableDomain || !title || !identityUrl) throw new Error('Missing legacy News ID input');
  return md5Legacy(registrableDomain + title + identityUrl);
}
export const legacyForumTopicId = exactUrl => md5Legacy(exactUrl);
export const legacyForumCommentId = exactPermalink => md5Legacy(exactPermalink);
export const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
export function weeklyIndex(publishedDate, timezone = 'Asia/Ho_Chi_Minh') {
  const date = new Date(publishedDate);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid publishedDate');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  const d = new Date(Date.UTC(+parts.year, +parts.month-1, +parts.day));
  const weekday = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - weekday);
  const year = d.getUTCFullYear();
  const week = Math.ceil((((d-new Date(Date.UTC(year,0,1)))/86400000)+1)/7);
  return `master${year}${String(week).padStart(2,'0')}`;
}
export function parseVietnamDate(raw) {
  const match = clean(raw).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error('Missing or unsupported published date: '+clean(raw));
  const [,day,month,year,hour,minute,second='0']=match;
  const utc=Date.UTC(+year,+month-1,+day,+hour-7,+minute,+second);
  const local=new Date(utc+7*3600000);
  if(local.getUTCFullYear()!==+year||local.getUTCMonth()!==+month-1||local.getUTCDate()!==+day||+hour>23||+minute>59||+second>59)throw new Error('Invalid calendar date');
  return new Date(utc).toISOString();
}
export function allowedUrl(href, base, config) {
  try { const u=new URL(href,base);if(!/^https?:$/.test(u.protocol)||u.username||u.password||!config.allowedHosts.includes(u.hostname.toLowerCase()))return null;u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^fbclid$|^gclid$/.test(k))u.searchParams.delete(k);return u.href; } catch { return null; }
}
export function parseListing(html, url, config) {
  const $=cheerio.load(html),articles=new Set(),categories=new Set(),pagination=new Set();
  const articleRegex=new RegExp(config.articlePattern,'i'),categoryRegex=new RegExp(config.categoryPattern,'i');
  $('a[href]').each((i,a)=>{const u=allowedUrl($(a).attr('href'),url,config);if(u&&articleRegex.test(new URL(u).pathname))articles.add(u);});
  $(config.seedSelector).each((i,a)=>{const u=allowedUrl($(a).attr('href'),url,config);if(u&&categoryRegex.test(new URL(u).pathname)&&!config.excludeCategories.includes(new URL(u).pathname)&&!articleRegex.test(new URL(u).pathname))categories.add(u);});
  $(config.paginationSelector).each((i,a)=>{const u=allowedUrl($(a).attr('href'),url,config);if(u&&!articleRegex.test(new URL(u).pathname)&&u!==url)pagination.add(u);});
  return {articles:[...articles],categories:[...categories],pagination:[...pagination],title:clean($('title').text())};
}
export function parseNewsArticle(html, identityUrl, config, now=new Date().toISOString()) {
  const $=cheerio.load(html),selectors=config.selectors;
  const title=clean($(selectors.title).first().text());
  const description=clean($(selectors.description).first().text())||clean($('meta[name=description]').attr('content'));
  const body=$(selectors.body).first().clone();
  const authorCandidates=$(selectors.author).toArray().map(e=>clean($(e).text()).replace(/^Tác giả\s*:\s*/i,'').trim()).filter(v=>v.length>0&&v.length<=120);
  const authorRaw=authorCandidates.slice(-1)[0]||'';
  const rawDate=clean($(selectors.publishedDate).first().text());
  const publishedDate=parseVietnamDate(rawDate);
  const picture=$('meta[property="og:image"]').attr('content')||'';
  const images=body.find('img').toArray().map(e=>({url:$(e).attr('data-original')||$(e).attr('src')||'',caption:$(e).attr('alt')||''})).filter(e=>e.url).map(e=>({...e,url:new URL(e.url,identityUrl).href}));
  const media=body.find('video, audio, iframe').toArray().map(e=>({type:e.tagName,url:$(e).attr('src')||$(e).find('source').attr('src')||''}));
  body.find(selectors.removeFromBody).remove();
  body.find('br').replaceWith('\n');body.find('p,div,li,figcaption,h2,h3,tr').each((i,e)=>$(e).append('\n'));
  const bodyText=body.text().split(/\r?\n/).map(clean).filter(Boolean).join('\n');
  const content=[description,bodyText].filter(Boolean).join('\n');
  const errors=[];if(!title)errors.push('missing_title');if(!body.length)errors.push('missing_body_container');if(bodyText.length<80&&!images.length&&!media.length)errors.push('missing_body');
  if(new Date(publishedDate).getTime()>new Date(now).getTime()+86400000)errors.push('future_published_date');
  if(errors.length)throw Object.assign(new Error(errors.join(',')),{validationErrors:errors});
  const author=authorRaw||config.siteName;
  const sourceLinks=$('.soucre_news a[href], .grid730 > div[style*="gray"] a[rel=nofollow][href]').toArray().map(a=>$(a).attr('href')).filter(Boolean);
  const categories=$(selectors.category).toArray().map(a=>({name:clean($(a).text()),url:new URL($(a).attr('href'),identityUrl).href}));
  const id=legacyNewsId({registrableDomain:config.registrableDomain,title,identityUrl});
  const document={insertedDate:now,publishedDate,authorId:authorRaw?(config.authorIdStrategy==='legacy-md5'?md5Legacy(config.siteId+author):author):config.siteId,author,siteId:config.siteId,siteName:config.siteName,title,content,url:identityUrl,description,picture:picture?new URL(picture,identityUrl).href:'',likes:0,comments:0,shares:0,interactions:0,ds:{source:'news-parser-pilot'}};
  return {_index:weeklyIndex(publishedDate,config.timezone),_type:'newsTopic',_id:id,_source:document,extracted:{nativeId:new URL(identityUrl).pathname.match(new RegExp(config.articlePattern,'i'))?.[1]||null,bodyText,images,media,categories,sourceLinks,rawDate,authorWasFallback:!authorRaw,contentSha256:crypto.createHash('sha256').update(content).digest('hex')}};
}
