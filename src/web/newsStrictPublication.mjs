import {userConfirmedDayPrecision,originalDayValue,userConfirmedOriginalDayProof,ORIGINAL_DAY_PROOF_POLICY,USER_CONFIRMED_DAY_PRECISION} from './newsUserConfirmedDayPrecision.mjs';
import {verifiedMxpressBrokenOgHeading} from './newsMxpressHeading.mjs';
import {newsDateOwnershipIssue} from './newsDateOwnership.mjs';
import {publicationFeedDate,publicationFeedHasGenerationClock} from './newsFeedIdentity.mjs';
import {verifiedSuckhoecongClock} from './newsSuckhoecongPublication.mjs';
import {verifiedNinhbinhNativeHeaderClock} from './newsNinhbinhVisibleClock.mjs';
import {verifiedTcdnLongformClock} from './newsTcdnLongformClock.mjs';
import {verifiedDoanhnghiepClock} from './newsDoanhnghiepPublication.mjs';
import {userConfirmedPublicationTimezone,USER_CONFIRMED_VIETNAM_CLOCK} from './newsUserConfirmedTimezone.mjs';
import {userConfirmedMidnight} from './newsUserConfirmedMidnight.mjs';
import {verifiedUserVisiblePublicationClock} from './newsUserVisiblePublicationClock.mjs';
import {verifiedPublicationPageIdentity,isReplyPublicationNode,publicationHeadlinesMatch} from './newsPublicationPageIdentity.mjs';
import {ownedOriginalPublicationMicrodata} from './newsOwnedPublicationMicrodata.mjs';
import {verifiedBongda24hHeaderClock,bongda24hMetadataMatchesHeader} from './newsBongda24hPublication.mjs';

export const STRICT_PUBLICATION_POLICY='strict_native_publication_v1';
const clean=x=>String(x||'').normalize('NFC').replace(/\s+/g,' ').trim();
const originalMeta='meta[property="article:published_time"],meta[name="pubdate"],meta[name="pub_date"],meta[name="publishdate"],meta[name="publish_date"],meta[name="publication_date"],meta[name="datePublished"],meta[itemprop="datePublished"],meta[name="og:published_time"],meta[property="og:published_time"],meta[name="DC.date.issued"],meta[name="DC.Date.Issued"]';
const visibleClocks='time,[itemprop="datePublished"],.info-author > ul > li:first-child,.datetime,.datetimeup,.date,.time,.article-date,.article__date,.detail-time,.detail__time,.date-time,.publish-date,.published-date,.post-date,.entry-date,.time-public,.detail_time,.time_detail,.meta-date,.news-detail-time,.author-time,.datetime,.time-post,.publish-time,.date-publish,.detail-datetime,.article-publish,.article-publish-time,.time-published,.breadcrumb-and-date,.date-post,.video-created,.bx-time,.node-created,.time_comment,.time-news-detail';
const seoulClock=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const key=raw=>{try{const u=new URL(raw);u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k);u.searchParams.sort();return u.hostname.replace(/^www\./,'')+(u.pathname.replace(/\/$/,'')||'/')+u.search;}catch{return null;}};
const same=(a,b,precision='minute')=>Math.floor(Date.parse(a)/(precision==='second'?1000:60000))===Math.floor(Date.parse(b)/(precision==='second'?1000:60000));
const clockText=n=>clean(n.clone().find('script,style,.comment,[class*="comment"],.share').remove().end().text());

export const UPDATED_FALLBACK_POLICY='native_updated_when_original_missing';
const modifiedMeta='meta[property="article:modified_time"],meta[name="last-modified"],meta[itemprop="dateModified"]';
const updatedNode=n=>/dateModified|updated|modified|cập nhật/i.test([n.attr('itemprop'),n.attr('class'),clockText(n)].join(' '));
const quasaOriginalMeta='head meta[property="article:published_time"]';
function quasaOwnedClock($,url,config){
 if(config.siteName!=='quasa.io'||!/^quasa\.io\/(?:[a-z]{2}\/)?(?:media|stories)\/[^/?]+$/.test(key(url)||''))return null;
 const canonical=$('head link[rel="canonical"]'),root=$('main div[class~="lg:col-span-2"]:has(> h1)');
 if(canonical.length!==1||key(canonical.attr('href'))!==key(url)||root.length!==1)return null;
 const official=$(quasaOriginalMeta),heading=root.children('h1'),clocks=root.find('div[class~="border-b"] time[datetime]');
 if(official.length!==1||heading.length!==1||clocks.length!==1)return null;
 const metadata=official.attr('content'),clock=clocks.attr('datetime');
 if(!metadata?.endsWith('Z')||!clock?.endsWith('Z')||!same(metadata,clock,'second'))return null;
 return {clock,heading:clean(heading.text())};
}
export function preferOriginalPublicationConfig($,url,config,articles=[]){
 if(config.publishedDate?.strategy==='jsonld'&&bongda24hMetadataMatchesHeader($,config))
  return {...config,publishedDate:{strategy:'selector',selector:'head meta[property="article:published_time"]',attribute:'content'}};
 if(config.publishedDate?.strategy==='jsonld'&&quasaOwnedClock($,url,config))return {...config,publishedDate:{strategy:'selector',selector:quasaOriginalMeta,attribute:'content'}};
 if(config.publicationDatePolicy!==UPDATED_FALLBACK_POLICY||config.publishedDate?.strategy!=='selector')return config;
 let n;try{n=$(config.publishedDate.selector).eq(config.publishedDate.index||0);}catch{return config;}
 if(!updatedNode(n)&&!n.is(modifiedMeta))return config;
 const originals=$(originalMeta).filter((i,e)=>clean($(e).attr('content')));
 if(originals.length)return {...config,publishedDate:{strategy:'selector',selector:originalMeta,attribute:'content',index:$(originalMeta).toArray().indexOf(originals[0])}};
 if(articles.some(a=>clean(a.datePublished)&&[a.url,a.mainEntityOfPage?.['@id'],!a.url&&!a.mainEntityOfPage?.['@id']?a.mainEntityOfPage?.url:null,typeof a.mainEntityOfPage==='string'?a.mainEntityOfPage:null,a['@id']].some(v=>v&&key(v)===key(url))))return {...config,publishedDate:{strategy:'jsonld'}};
 return config;
}

// Conservative positive proof, not merely the absence of a known bad selector.
export function verifyStrictPublication($,url,config,parsed,{parseDate,articles=[],context={}}){
 const e=parsed.extracted,p=parsed._source,setting=config.publishedDate;
 const reject=code=>({ok:false,code});
 const dayEnabled=userConfirmedDayPrecision(config,url);
 const date=raw=>{const day=dayEnabled&&originalDayValue(raw,config,parseDate);return day?{iso:day,raw,precision:'day',timezone:'not_applicable_day_precision'}:parseDate(raw,config.timezone,config.dateOrder,config.clockFormat);};
 const anchored=raw=>parseDate(raw,null,config.dateOrder,config.clockFormat);
 const approvedLocal=config.publicationTimePolicy==='native_date_midnight_if_missing'&&config.timezone==='Asia/Ho_Chi_Minh';
 const confirmedLocal=userConfirmedPublicationTimezone(config,url);
 const rawDate=date(e.dateEvidence),approvedDay=approvedLocal&&e.datePrecision==='day'&&rawDate?.precision==='day'&&rawDate.iso===p.publishedDate;
 const approvedDateOnly=dayEnabled&&e.datePrecision==='day'&&p.publishedDatePrecision==='day'&&originalDayValue(e.dateEvidence,config,parseDate)===p.publishedDate;
 if(!['minute','second'].includes(e.datePrecision)&&!approvedDay&&!approvedDateOnly)return reject('NEWS_PUBLICATION_CLOCK_MISSING');
 const calendar=iso=>new Intl.DateTimeFormat('en-CA',{timeZone:config.timezone||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
 const agrees=d=>{if(approvedDateOnly)return originalDayValue(d.raw,config,parseDate)===p.publishedDate;if(dayEnabled&&d.precision==='day'){const day=originalDayValue(d.raw,config,parseDate);if(!day)return false;if(confirmedLocal)return day===calendar(p.publishedDate);const start=Date.parse(day),instant=Date.parse(p.publishedDate);return instant>=start-14*3600000&&instant<start+36*3600000;}return e.datePrecision==='day'||d.precision==='day'?calendar(d.iso)===calendar(p.publishedDate):same(d.iso,p.publishedDate,e.datePrecision);};

 const target=key(url),canonical=$('link[rel="canonical"]').attr('href')||$('meta[property="og:url"]').attr('content');
 const pageIdentity=verifiedPublicationPageIdentity($,url,config,parsed,articles,parseDate),pageKeys=pageIdentity?.keys||[target];
 if(canonical&&!pageKeys.includes(key(new URL(canonical,url).href))&&!pageIdentity?.canonicalIsAttribution)return reject('NEWS_PUBLICATION_PAGE_IDENTITY_CONFLICT');
 if(p.url!==url&&(!pageIdentity||pageIdentity.canonicalIsAttribution||key(p.url)!==key(pageIdentity.declaredCanonical)))return reject('NEWS_PUBLICATION_PAGE_IDENTITY_CONFLICT');
 const title=clean(p.title),headline=n=>n.find('h1,h2,h3').toArray().some(h=>clean($(h).text())===title);
 const ownedHeadingCount=root=>{let heads;try{heads=config.title?.strategy==='selector'?$(config.title.selector):root.find('h1,h2,h3');}catch{return 0;}return heads.filter((i,h)=>{if(!$(h).is('h1,h2,h3')||!$(h).parents().toArray().includes(root[0])||clean($(h).text())!==title)return false;return $(h).find('a[href]').add($(h).closest('a[href]')).toArray().every(a=>{try{const u=new URL($(a).attr('href'),url);return /^https?:$/.test(u.protocol)&&pageKeys.includes(key(u.href));}catch{return false;}});}).length;};
 const nativeHeading=root=>{const known={'mxpress.vn':['.col-sm-12.col-md-9:has(> .b-article > .b-meta)','.b-article > .b-article-title'],'dzogame.vn':['.postWrapper','#MainContent_tilte_post > .titleWrapper2'],'truyenhinh.baobinhduong.vn':['.video-body','.title-video']},rule=known[config.siteName];if(!rule||new URL(url).hostname.replace(/^www\./,'')!==config.siteName||config.publicationArticleScope!==rule[0]||config.title?.strategy!=='selector'||config.title.selector!==rule[1])return false;let nodes;try{nodes=root.find(rule[1]);}catch{return false;}return nodes.length===1&&!nodes.parents('nav,aside,footer,.related,.comments').length&&clean(nodes.text())===title&&(publicationHeadlinesMatch($,config.siteName==='mxpress.vn'?clean($('meta[property="og:title"]').attr('content')).replace(/ - Mxpress - Kênh thông ti thị trường$/,''):$('meta[property="og:title"]').attr('content'),title)||config.siteName==='mxpress.vn'&&verifiedMxpressBrokenOgHeading($,url,title));};
 function scope(node,allowUpdated=false){
  const originalWordpressClock=node.is('time.entry-date[datetime]')&&headline(node.closest('article'))&&$('meta[property="article:published_time"]').attr('content')===node.attr('datetime');
  if(isReplyPublicationNode($,node)||newsDateOwnershipIssue($,node,url)||/dateCreated/i.test(node.attr('itemprop')||'')||!allowUpdated&&!originalWordpressClock&&updatedNode(node))return null;
  const label=clockText(node.parent().clone().find('h1,h2,h3,h4').remove().end());
  if(!allowUpdated&&label.length<180&&/cập nhật|updated|modified/i.test(label))return null;
  if(verifiedSuckhoecongClock($,url,config,node,title))return node.closest('section.box-author');
  if(verifiedDoanhnghiepClock($,url,config,node,title))return node.closest('#printSingle');
  if(verifiedTcdnLongformClock($,url,config,node,title))return node.closest('.webpage-container');
  if(verifiedNinhbinhNativeHeaderClock($,url,config,node,title))return node.parent();
  if(config.publicationArticleScope){
   let root,body;try{root=$(config.publicationArticleScope);body=$(config.body?.selector);}catch{return null;}
   if(root.length===1&&!root.is('html,body,main')&&body.length===1&&node.parents().toArray().includes(root[0])&&body.parents().toArray().includes(root[0])
    &&(ownedHeadingCount(root)===1||nativeHeading(root))
    &&!root.find('article').toArray().some(a=>!(a===body[0]&&a.parent===root[0]&&$(a).is('[itemprop~="articleBody"]')&&!$(a).find('h1').length&&!$(a).is('[itemscope]'))&&$(a).find('h1,h2,h3').length&&!headline($(a))))return root;
  }
  const forumHeader=node.closest('.p-body-header');
  if(forumHeader.length&&headline(forumHeader)&&articles.some(a=>a['@type']==='DiscussionForumPosting'&&publicationHeadlinesMatch($,a.headline,title,a)&&[a.url,a['@id']].some(u=>u&&key(u)===target)))return forumHeader;
  for(const element of node.parents().toArray().slice(0,6)){
   const n=$(element);if(n.is('html,body,main'))break;
   if(n.is('article')&&n.find('h1,h2,h3').length&&!headline(n))return null;
   if(config.siteName==='vietnamdaily.kienthuc.net.vn'&&n.is('.main-col.content-col')&&n.find('h1').length)return headline(n)?n:null;
   if(headline(n)&&(n.is('article')||/article|detail|entry|post|dt-news/i.test(n.attr('class')||n.attr('id')||'')))return n;
  }
  return null;
 }
 const bound=articles.filter(a=>!a.datePublishedFallbackUpload&&publicationHeadlinesMatch($,a.headline,title,a)&&[a.url,a.mainEntityOfPage?.['@id'],!a.url&&!a.mainEntityOfPage?.['@id']?a.mainEntityOfPage?.url:null,typeof a.mainEntityOfPage==='string'?a.mainEntityOfPage:null,a['@id']].some(v=>v&&pageKeys.includes(key(String(v)))));
 const articleOwn=bound.filter(a=>/Article|BlogPosting|Reportage|DiscussionForumPosting/.test(String(a['@type'])));
 const own=articleOwn.length?articleOwn:bound.filter(a=>/^(?:VideoObject|AudioObject|PodcastEpisode|RadioEpisode)$/.test(String(a['@type'])));
 const ownDates=own.map(a=>date(a.datePublished)).filter(Boolean);
 const microdata=ownedOriginalPublicationMicrodata($,url,title,(dayEnabled||confirmedLocal)?(raw)=>date(raw):parseDate,pageKeys,{allowDay:dayEnabled}),microDates=microdata.map(m=>m.date);
 // A floating ISO duplicate may inherit an offset only from an exact wall-clock
 // match in this article's explicit JSON-LD, never from a configured default zone.
 const wall=raw=>{const s=String(raw||'');if(!/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/.test(s))return null;return parseDate(s.replace(/(?:Z|[+-]\d\d:?\d\d)$/i,'')+'Z',null);};
 const corroboratedClock=(raw,d)=>{if(anchored(raw)||confirmedLocal||approvedLocal)return d;const nominal=parseDate(raw,'UTC',config.dateOrder,config.clockFormat);
  if(!nominal||!['minute','second'].includes(nominal.precision))return d;
  const matches=[...ownDates,...microDates].filter(a=>anchored(a.raw)&&wall(a.raw)&&same(wall(a.raw).iso,nominal.iso,nominal.precision));
  return new Set(matches.map(a=>a.iso)).size===1?{...(d||nominal),iso:matches[0].iso}:d;
 };
 const metaDates=$(originalMeta).toArray().filter(n=>{const node=$(n);if(isReplyPublicationNode($,node)||node.closest('nav,footer,aside,[class*="related"],[class*="recommend"]').length)return false;
  return !!node.parents('head').length||!node.parents('article,[itemscope],.main-col.content-col').length||!!scope(node);
 }).map(n=>{const raw=$(n).attr('content'),d=date(raw);
  if(!d||anchored(raw)||confirmedLocal||approvedLocal)return d;
  const w=wall(raw),matches=[...ownDates,...microDates].filter(a=>anchored(a.raw)&&w&&wall(a.raw)&&same(wall(a.raw).iso,w.iso,d.precision));
  return new Set(matches.map(a=>a.iso)).size===1?{...d,iso:matches[0].iso}:d;
 }).filter(Boolean);
 let selected=null,updatedFallback=false;
 if(setting.strategy==='selector'){
  try{const nodes=$(setting.selector);selected=nodes.eq(setting.index||0);if(!selected.length)return reject('NEWS_PUBLICATION_NODE_MISSING');
   if(isReplyPublicationNode($,selected))return reject('NEWS_PUBLICATION_NODE_IS_REPLY');
   if(nodes.length>1){const values=nodes.toArray().map(n=>date(setting.attribute?$(n).attr(setting.attribute):$(n).attr('content')||$(n).attr('datetime')||clockText($(n)))).filter(Boolean);if(values.some(d=>!same(d.iso,p.publishedDate,e.datePrecision)))return reject('NEWS_PUBLICATION_SELECTOR_AMBIGUOUS');}
  }catch{return reject('NEWS_PUBLICATION_SELECTOR_INVALID');}
  updatedFallback=config.publicationDatePolicy===UPDATED_FALLBACK_POLICY&&(updatedNode(selected)||selected.is(modifiedMeta));
  if(updatedFallback){
   if(own.some(a=>clean(a.datePublished))||$(originalMeta).toArray().some(n=>clean($(n).attr('content'))))return reject('NEWS_ORIGINAL_PUBLICATION_MUST_TAKE_PRECEDENCE');
   const originalClock=$(visibleClocks).toArray().some(n=>{const x=$(n);return !updatedNode(x)&&scope(x)&&date(clockText(x));});
   if(originalClock)return reject('NEWS_ORIGINAL_PUBLICATION_MUST_TAKE_PRECEDENCE');
  }
  if(!selected.is('meta')&&!scope(selected,updatedFallback)&&!((ownDates.some(agrees)||microdata.some(m=>m.node===selected[0]&&agrees(m.date)))&&!newsDateOwnershipIssue($,selected,url)&&!/(?:updated|modified|cập nhật)/i.test(clockText(selected))))return reject('NEWS_PUBLICATION_OWNERSHIP_UNCONFIRMED');
  if(selected.is('meta')&&!selected.is(originalMeta)&&!(updatedFallback&&selected.is(modifiedMeta)))return reject('NEWS_PUBLICATION_FIELD_NOT_ORIGINAL');
 }

 const native=[];let nativeClockAvailable=false;
 const bongda24hClock=verifiedBongda24hHeaderClock($,url,config,title,parseDate,p.content,articles);
 if(bongda24hClock)native.push({...bongda24hClock,anchored:true});
 const quasa=quasaOwnedClock($,url,config);
 if(quasa?.heading===title){const value=anchored(quasa.clock);if(value)native.push({...value,anchored:true});}
 if(config.siteName==='tnktvmblog2.wordpress.com'&&target?.startsWith('tnktvmblog2.wordpress.com/')&&canonical&&
  key(new URL(canonical,url).href)===target){
  const clocks=$('article.post.type-post.status-publish > footer.entry-footer .posted-on time.entry-date.published[datetime]');
  const node=clocks.first(),article=node.closest('article'),nativeDate=anchored(node.attr('datetime'));
  const visible=parseDate(clockText(node),'UTC',config.dateOrder,config.clockFormat);
  if(clocks.length===1&&article.find('h1').length===1&&headline(article)&&article.find('.entry-content').length===1&&
   nativeDate?.precision==='second'&&visible?.precision==='day'&&visible.iso.slice(0,10)===nativeDate.iso.slice(0,10)&&
   metaDates.some(value=>anchored(value.raw)&&same(value.iso,nativeDate.iso,'second')))native.push({...nativeDate,anchored:true});
 }
 const jknStory=config.siteName==='news.jkn.co.kr'&&/^news\.jkn\.co\.kr\/(?:editions\/[a-z-]+\/)?post\/\d+$/.test(target);
 const jknModified=jknStory&&anchored($('head meta[property="article:modified_time"]').attr('content'));
 const observedClocks=setting.strategy==='public_feed'?visibleClocks+',.pubdate':visibleClocks;
 let ownedClocks=[];if(config.publicationArticleScope)try{const region=$(config.publicationArticleScope);if(region.length===1&&!region.is('body,html,main'))ownedClocks=region.find(observedClocks).toArray();}catch{}
 for(const element of [...new Set([...ownedClocks,...$(observedClocks).toArray()])].slice(0,120)){
  const n=$(element);if(n.is('meta')||!scope(n))continue;
  if(jknModified&&n.is('details > div > time[datetime]')){
   const shown=anchored(n.attr('datetime')),summary=n.closest('details').children('summary').find('time[datetime]');
   const published=summary.length===1&&anchored(summary.attr('datetime'));
   if(shown&&published&&same(shown.iso,jknModified.iso,'second')&&!same(shown.iso,published.iso,'second')
    &&ownDates.some(value=>anchored(value.raw)&&same(value.iso,published.iso,'second')))continue;
  }
  const raw=n.is('time')&&config.siteName==='voz.vn'&&n.closest('.p-body-header').length&&n.attr('datetime')||clockText(n);if(raw.length>150)continue;
  // The English templates label a duplicate Vietnam wall clock as GMT.
  // Prefer the precise, agreeing original fields only for that exact duplicate.
  if(['vietnamhoinhap.vn','vnba.org.vn'].includes(config.siteName)&&target?.startsWith(config.siteName+'/en/')&&n.is('.post-date')){
   const visible=n.children('span').first().text().trim();
   const wallClock=/^\d{2}\/\d{2}\/\d{4} at \d{2}:\d{2} \(GMT\)$/.test(visible)&&parseDate(visible.replace(' (GMT)',''),'Asia/Ho_Chi_Minh','DMY');
   const pubdate=anchored($('head meta[name="pubdate"]').attr('content'));
   const articleTime=anchored($('head meta[property="article:published_time"]').attr('content'));
   if(wallClock&&pubdate&&articleTime&&same(pubdate.iso,articleTime.iso,'second')&&same(wallClock.iso,articleTime.iso)&&
    ownDates.some(value=>anchored(value.raw)&&same(value.iso,articleTime.iso,'second')))continue;
  }
  if(dayEnabled&&!originalDayValue(raw,config,parseDate)&&/\d{1,2}:\d{2}/.test(raw))nativeClockAvailable=true;
  let d=corroboratedClock(raw,date(raw));
  // A time element can state its offset in datetime while displaying the same
  // wall clock without a zone. Accept that offset only when both clocks match.
  const machine=n.is('time')&&n.attr('datetime');
  if(machine&&!anchored(raw)){
   const explicit=anchored(machine),nominal=wall(machine),visible=parseDate(raw,'UTC',config.dateOrder,config.clockFormat);
   if(explicit&&nominal&&visible&&['minute','second'].includes(visible.precision)){
    if(same(nominal.iso,visible.iso,visible.precision))d=explicit;
    else if(jknStory
     &&ownDates.some(value=>anchored(value.raw)&&same(value.iso,explicit.iso,'second'))
     &&metaDates.some(value=>anchored(value.raw)&&same(value.iso,explicit.iso,'second'))
     &&same(seoulClock.format(new Date(explicit.iso)).replace(' ','T')+'Z',visible.iso,visible.precision))d=explicit;
   }
  }
  if(d&&(['minute','second'].includes(d.precision)||(approvedLocal||dayEnabled)&&d.precision==='day'))native.push({...d,anchored:!!anchored(d.raw)});
 }
 if(approvedDateOnly&&(nativeClockAvailable||[...ownDates,...metaDates,...microDates,...native].some(d=>['minute','second'].includes(d.precision))))return reject('NEWS_ORIGINAL_PUBLICATION_CLOCK_AVAILABLE');
 // Every independent native publication clock must agree at its own precision.
 const visiblePriority=selected&&verifiedUserVisiblePublicationClock($,url,config,selected,title);
 const independentDates=visiblePriority?[...microDates,...native]:[...ownDates,...metaDates,...microDates,...native];
 for(const d of independentDates){
  if(d.precision==='day'){if((approvedLocal||dayEnabled)&&!agrees(d))return reject('NEWS_PUBLICATION_EVIDENCE_CONFLICT');continue;}
  if(!same(d.iso,p.publishedDate,d.precision==='second'&&e.datePrecision==='second'?'second':'minute'))return reject('NEWS_PUBLICATION_EVIDENCE_CONFLICT');
 }
 const explicit=[...ownDates,...metaDates,...microDates].filter(d=>anchored(d.raw));
 let source;
 if(setting.strategy==='public_feed'){
  const match=context.feedUrl===setting.feedUrl&&publicationFeedDate(context,url);
  if(!match||!anchored(match.raw)||!same(match.iso,p.publishedDate,'second')||!same(anchored(match.raw).iso,p.publishedDate,'second'))return reject('NEWS_PUBLICATION_FEED_UNCONFIRMED');
  if(publicationFeedHasGenerationClock(context)&&!independentDates.some(d=>['minute','second'].includes(d.precision)&&same(d.iso,p.publishedDate,d.precision==='second'&&e.datePrecision==='second'?'second':'minute')))return reject('NEWS_PUBLICATION_FEED_GENERATION_CLOCK_UNVERIFIED');
  source='url_bound_publication_feed';
 }else if(setting.strategy==='jsonld'){
  if(!ownDates.some(d=>(anchored(d.raw)||approvedLocal||confirmedLocal||approvedDateOnly)&&agrees(d)))return reject('NEWS_PUBLICATION_JSONLD_NOT_URL_BOUND');
  source='url_bound_original_jsonld';
 }else if(selected?.is('meta')){
  if(!canonical||!headline($('body')))return reject('NEWS_PUBLICATION_PAGE_IDENTITY_UNCONFIRMED');
  if(!ownDates.length&&!native.length&&!microDates.some(agrees)){
   const corroboratedUpdate=updatedFallback&&$(visibleClocks).toArray().some(n=>{const x=$(n),d=date(clockText(x));return updatedNode(x)&&scope(x,true)&&d&&agrees(d);});
   if(!corroboratedUpdate)return reject('NEWS_PUBLICATION_METADATA_UNCORROBORATED');
  }
  if(!anchored(e.dateEvidence)&&!explicit.length&&!approvedLocal&&!approvedDateOnly&&!(confirmedLocal&&(native.length||ownDates.some(agrees))))return reject('NEWS_PUBLICATION_TIMEZONE_UNCONFIRMED');
  source='corroborated_original_metadata';
 }else if(selected){
  const kbs=new URL(url);
  // Each supported edition's official RSS agrees to the second with the visible KST clock.
  const kbsClock=config.siteName==='world.kbs.co.kr'&&kbs.hostname==='world.kbs.co.kr'&&kbs.pathname==='/service/news_view.htm'&&
   /^[aefgijcrsv]$/.test(kbs.searchParams.get('lang')||'')&&/^\d+$/.test(kbs.searchParams.get('Seq_Code')||'')&&
   config.timezone==='Asia/Seoul'&&selected.is('section.comp_view_default#ele1 > .title_area > p.date')&&
   scope(selected)?.is('section.comp_view_default#ele1')&&/^Writ(?:e|ten): \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?: \/(?: Update(?:d)?: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})?)?$/.test(clockText(selected));
  if(!anchored(e.dateEvidence)&&!explicit.length&&!approvedLocal&&!confirmedLocal&&!approvedDateOnly&&!kbsClock&&!verifiedSuckhoecongClock($,url,config,selected,title))return reject('NEWS_PUBLICATION_TIMEZONE_UNCONFIRMED');
  source='scoped_original_article_clock';
 }else return reject('NEWS_PUBLICATION_SOURCE_UNCONFIRMED');
 if(approvedDateOnly){if(updatedFallback)return reject('NEWS_PUBLICATION_FIELD_NOT_ORIGINAL');e.publicationDateKind='original';return {ok:true,version:2,policy:ORIGINAL_DAY_PROOF_POLICY,url:p.url,publishedDate:p.publishedDate,precision:'day',source:source==='scoped_original_article_clock'?'scoped_original_article_day':source,publicationDateKind:'original',publicationDatePolicy:'original_only',publicationPrecisionPolicy:USER_CONFIRMED_DAY_PRECISION,datePrecisionAuthority:config.datePrecisionProvenance};}
 if(updatedFallback){source='scoped_native_updated_fallback';e.publicationDateKind='updated_fallback';e.publicationDatePolicy=UPDATED_FALLBACK_POLICY;}else e.publicationDateKind='original';
 return {ok:true,version:1,policy:STRICT_PUBLICATION_POLICY,url:p.url,publishedDate:p.publishedDate,precision:e.datePrecision,source,...(updatedFallback?{publicationDatePolicy:UPDATED_FALLBACK_POLICY,publicationDateKind:'updated_fallback'}:{}),...(approvedLocal?{publicationTimePolicy:config.publicationTimePolicy,timezone:config.timezone,defaultedClock:approvedDay}:{}),...(approvedDay&&userConfirmedMidnight(config,url)?{publicationDateKind:'original',publicationDatePolicy:'original_only',originalCalendarDay:new Date(Date.parse(p.publishedDate)+7*3600000).toISOString().slice(0,10),midnightAuthority:config.midnightProvenance}:{}),...(visiblePriority?{publicationEvidenceAuthority:config.publicationEvidencePolicy,metadataPublicationDates:[...ownDates,...metaDates].map(d=>({raw:d.raw,iso:d.iso}))}:{}),...(confirmedLocal?{publicationTimePolicy:USER_CONFIRMED_VIETNAM_CLOCK,timezone:config.timezone,timezoneAuthority:config.timezoneProvenance}:{})};
}

export function hasStrictPublicationProof(parsed){
 const proof=parsed?.extracted?.publicationProof,p=parsed?._source;
 if(userConfirmedOriginalDayProof(proof))return !!p&&p.publishedDatePrecision==='day'&&proof.datePrecisionAuthority.scope===p.siteName&&proof.url===p.url&&proof.publishedDate===p.publishedDate;
 return !!(p&&proof?.ok&&proof.version===1&&proof.policy===STRICT_PUBLICATION_POLICY&&proof.url===p.url&&proof.publishedDate===p.publishedDate&&(['minute','second'].includes(proof.precision)||proof.precision==='day'&&proof.defaultedClock===true&&proof.publicationTimePolicy==='native_date_midnight_if_missing'&&proof.timezone==='Asia/Ho_Chi_Minh'&&Number.isFinite(Date.parse(p.publishedDate))&&new Date(Date.parse(p.publishedDate)+7*3600000).toISOString().endsWith('T00:00:00.000Z')));
}
