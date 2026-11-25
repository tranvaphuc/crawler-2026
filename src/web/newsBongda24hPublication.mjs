const clean=value=>String(value||'').normalize('NFC').replace(/\s+/g,' ').trim();
const pageKey=raw=>{try{const u=new URL(raw);u.hash='';for(const name of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(name))u.searchParams.delete(name);return u.hostname.replace(/^www\./,'')+u.pathname.replace(/\/$/,'')+u.search;}catch{return null;}};

export function bongda24hMetadataMatchesHeader($,config){
 if(config.siteName!=='bongda24h.vn'||config.nativePublicationClockPolicy!=='bongda24h_owned_header_v1')return false;
 const root=$('article.the-article'),header=root.children('.the-article-header'),clock=header.children('p.the-article-time'),meta=$('head meta[property="article:published_time"]');
 if(root.length!==1||header.length!==1||header.children('h1.the-article-title').length!==1||clock.length!==1||meta.length!==1)return false;
 const raw=clean(clock.text());if(/cập nhật|updated|modified/i.test(raw))return false;
 const visible=raw.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*\(GMT\+7\)$/),original=meta.attr('content')?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\+07:00$/);
 if(!visible||!original)return false;
 const [,d,m,y,h,mi,s]=visible,[,oy,om,od,oh,omi,os]=original;
 const date=new Date(Date.UTC(+y,+m-1,+d,+h,+mi,+(s||0)));
 if(date.getUTCFullYear()!==+y||date.getUTCMonth()!==+m-1||date.getUTCDate()!==+d||date.getUTCHours()!==+h||date.getUTCMinutes()!==+mi)return false;
 return +y===+oy&&+m===+om&&+d===+od&&+h===+oh&&+mi===+omi&&(s===undefined||+s===+os);
}

// The article header owns a visible GMT+7 publication clock even when the
// JSON-LD headline retains an older score/prefix. Metadata keeps real seconds.
export function verifiedBongda24hHeaderClock($,url,config,title,parseDate,content='',articles=[]){
 if(config.siteName!=='bongda24h.vn'||config.nativePublicationClockPolicy!=='bongda24h_owned_header_v1')return null;
 const target=new URL(url);if(target.hostname.replace(/^www\./,'')!=='bongda24h.vn'||!/^\/[^/]+\/[^/]+-\d+-\d+\.html$/.test(target.pathname))return null;
 const root=$('article.the-article'),header=root.children('.the-article-header'),heading=header.children('h1.the-article-title'),clock=header.children('p.the-article-time'),meta=$('head meta[property="article:published_time"]');
 let body;try{body=$(config.body?.strategy==='selector'?config.body.selector:'.the-article-body');}catch{return null;}
 const column=root.parent();
 const visible=column.clone();visible.find('script,style,noscript,aside,nav,footer,[class*="related"],[class*="recommend"]').remove();visible.find('br').replaceWith(' ');visible.find('p,div,li,h1,h2,h3').each((i,n)=>$(n).append(' '));
 const visibleColumn=clean(visible.text());
 const visibleBody=clean(content).length>=120&&column.is('div.content-left')&&column.find('h1').length===1&&visibleColumn.includes(clean(content));
 const ownedBody=visibleBody||body.length===1&&!body.closest('aside,nav,footer,[class*="related"],[class*="recommend"]').length&&(body.parents().toArray().includes(root[0])||column.is('div.content-left')&&column.find('h1').length===1&&body.parents().toArray().includes(column[0]));
 if(root.length!==1||header.length!==1||heading.length!==1||$('h1').length!==1||clock.length!==1||meta.length!==1||clean(heading.text())!==clean(title))return null;
 const canonical=$('head link[rel="canonical"]'),og=$('head meta[property="og:url"]');if(canonical.length!==1||og.length!==1||pageKey(canonical.attr('href'))!==pageKey(url)||pageKey(og.attr('content'))!==pageKey(url))return null;
 const raw=clean(clock.text());if(!/\b\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?\s*\(GMT\+7\)$/.test(raw)||/cập nhật|updated|modified/i.test(raw))return null;
 const visibleDate=parseDate(raw,null),original=parseDate(meta.attr('content'),null);if(!visibleDate||!original||!['minute','second'].includes(visibleDate.precision)||Math.floor(Date.parse(visibleDate.iso)/60000)!==Math.floor(Date.parse(original.iso)/60000))return null;
 const selfBody=config.body?.strategy==='jsonld'&&clean(content).length>=120&&articles.some(article=>{
  if(!/^(?:NewsArticle|Article)$/.test(article['@type'])||article.datePublishedFallbackUpload||typeof article.articleBody!=='string')return false;
  const urls=[article.url,article.mainEntityOfPage?.['@id'],typeof article.mainEntityOfPage==='string'?article.mainEntityOfPage:null,article['@id']];
  if(!urls.some(raw=>pageKey(raw)===pageKey(url)))return false;
  const schemaDate=parseDate(article.datePublished,null);if(!schemaDate||schemaDate.iso!==original.iso)return false;
  const headline=clean($('<div>').html(String(article.headline||'')).text()),prefix=headline.slice(0,headline.length-clean(title).length);
  if(headline!==clean(title)&&!(headline.endsWith(clean(title))&&/^.{1,100}\d+\s*[-–]\s*\d+.{0,100}:\s*$/.test(prefix)))return false;
  return clean($('<div>').html(article.articleBody).text())===clean(content);
 });
 if(!ownedBody&&!selfBody)return null;
 return visibleDate;
}
