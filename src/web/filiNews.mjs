import * as cheerio from 'cheerio';

const clean=value=>String(value||'').normalize('NFC').replace(/\s+/g,' ').trim();
const fail=error=>({error});
function pageKey(raw,base){try{const u=new URL(raw,base);if(!/^https?:$/.test(u.protocol)||u.username||u.password)return null;return u.hostname.replace(/^www\./,'')+u.pathname;}catch{return null;}}

// The public print action supplies publishTime, independently of the page's
// relative age label. Keep the explicit offset from original publication metadata.
export function filiPrintRequest(html,url){
  const u=new URL(url),match=u.pathname.match(/^\/\d{4}\/\d{2}\/.+-(\d+)-(\d+)\.htm$/);
  if(u.hostname.replace(/^www\./,'')!=='fili.vn'||!match)return null;
  const $=cheerio.load(html),id=Number(match[2]);
  if(!Number.isSafeInteger(id)||id<=0)return null;
  const controls=$('button[onclick]').toArray().map(n=>$(n).attr('onclick').match(/^openPrintPage\((\d+)\)$/)?.[1]).filter(Boolean);
  if(!controls.length||controls.some(value=>Number(value)!==id))return null;
  return {id,url:'https://fili.vn/_Partials/ContentGetArticle?articleId='+id};
}

export function normalizeFiliPrintClock(html,url,raw){
  const request=filiPrintRequest(html,url);if(!request)return fail('fili_print_identity_missing');
  const $=cheerio.load(html),heading=$('h1.fili-shortform-title'),metadata=$('head meta[property="article:published_time"]');
  const canonical=$('head link[rel="canonical"]'),ogUrl=$('head meta[property="og:url"]');
  if(heading.length!==1||metadata.length!==1||canonical.length!==1||ogUrl.length!==1||
    pageKey(canonical.attr('href'),url)!==pageKey(url)||pageKey(ogUrl.attr('content'),url)!==pageKey(url)||
    raw?.articleID!==request.id||typeof raw.url!=='string'||pageKey(raw.url,url)!==pageKey(url)||
    clean(raw.title)!==clean(heading.text()))return fail('fili_print_identity_mismatch');
  const original=metadata.attr('content'),clock=raw.publishTime;
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(original||'')||
    !Number.isFinite(Date.parse(original))||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?$/.test(clock||'')||
    clock.slice(0,19)!==original.slice(0,19))return fail('fili_original_publication_conflict');
  const root=heading.closest('.fili-shortform-body[itemprop="articleBody"]'),header=heading.parent();
  if(root.length!==1||root.closest('main').attr('id')!=='article-'+request.id||root.find('h1').length!==1||header.find('.fili-shortform-meta').length!==1)return fail('fili_print_article_scope_missing');
  header.find('[data-crawler-fili-print-clock]').remove();
  header.find('.fili-shortform-meta').prepend($('<time class="publish-date" data-crawler-fili-print-clock="original">').text(clock));
  $('head').append($('<meta>').attr({name:'crawler:source-api',content:request.url}));
  return {html:$.html(),evidence:{kind:'fili_public_print_original_clock',articleId:request.id,publishTime:clock,originalPublication:original,apiUrl:request.url}};
}

export async function fetchFiliPrintClock(page,url,get){
  if(page.error||!page.html)return page;
  const request=filiPrintRequest(page.html,url);if(!request)return {...page,error:'fili_print_identity_missing'};
  const api=await get(request.url,{method:'POST',data:{articleId:request.id},headers:{'Content-Type':'application/json;charset=utf-8'},reviewFailed:true,taskRole:'publisher_dependency'});
  if(api.error||!api.html)return {...page,error:'fili_print_unavailable'};
  if(api.finalUrl&&api.finalUrl!==request.url)return {...page,error:'fili_print_redirect_unconfirmed'};
  let raw;try{raw=JSON.parse(api.html);}catch{return {...page,error:'fili_print_invalid_json'};}
  const normalized=normalizeFiliPrintClock(page.html,url,raw);
  return normalized.error?{...page,error:normalized.error}:{...page,html:normalized.html,normalization:'fili_public_print_original_clock',publicationAdapterEvidence:normalized.evidence};
}
