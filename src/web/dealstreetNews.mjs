import * as cheerio from 'cheerio';
const metadataUrl='https://www.dealstreetasia.com/wp-json/';
export function normalizeDealstreetArticle(html,url,cms){
 let state;try{state=JSON.parse(cheerio.load(html)('#__NEXT_DATA__').text());}catch{return {error:'public_next_article_state_missing'};}
 const props=state.props?.pageProps,p=props?.wpData;
 if(!p||props.loggedIn!==false||props.subscribed!==false||props.freeContent!==true||props.premiumContent!==false||props.researchContent!==false||p.premium!==false||p.research!==false||props.overlay!==false)return {error:'publisher_restricted_or_unconfirmed_public_content'};
 let requested,canonical;try{requested=new URL(url);canonical=new URL(p.link);}catch{return {error:'public_next_article_identity_mismatch'};}
 const host=u=>u.hostname.replace(/^www\./,'');
 if(!/^https?:$/.test(requested.protocol)||requested.username||requested.password||host(requested)!=='dealstreetasia.com'||host(canonical)!=='dealstreetasia.com'||!/^https?:$/.test(canonical.protocol)||canonical.username||canonical.password||canonical.search||canonical.hash||canonical.pathname.replace(/\/$/,'')!==requested.pathname.replace(/\/$/,'')||!/^\d+$/.test(String(p.id))||!requested.pathname.replace(/\/$/,'').endsWith('-'+p.id)||typeof p.title!=='string'||typeof props.content!=='string'||cheerio.load(props.content).text().trim().length<100)return {error:'public_next_article_identity_or_body_missing'};
 if(!cms)return {error:'cms_public_timezone_missing'};
 let cmsHost;try{cmsHost=host(new URL(cms.url));}catch{}
 // The CMS declares a fixed +05:30 setting today. Never infer Singapore time
 // from the publisher address, or use sitemap lastmod as publication time.
 const offset=Number(cms.gmt_offset)*60;
 if(cmsHost!=='dealstreetasia.com'||cms.timezone_string!==''||cms.gmt_offset===undefined||cms.gmt_offset===null||cms.gmt_offset===''||!Number.isInteger(offset)||Math.abs(offset)>14*60||offset%15!==0||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(p.date||''))return {error:'cms_public_timezone_unconfirmed'};
 const sign=offset<0?'-':'+',abs=Math.abs(offset),suffix=sign+String(Math.floor(abs/60)).padStart(2,'0')+':'+String(abs%60).padStart(2,'0'),published=p.date.replace(' ','T')+suffix;
 const $=cheerio.load('<html><head></head><body><h1></h1><div class="article-content"></div></body></html>');$('h1').text(p.title);$('.article-content').html(props.content);
 const author=(p.authors||[]).map(a=>a.display_name).filter(v=>typeof v==='string'&&v.length<160).join(', ');
 $('head').append($('<meta>').attr({name:'description',content:p.excerpt||''}),$('<meta>').attr({property:'og:image',content:p.image_url||''}),$('<link>').attr({rel:'canonical',href:p.link}),$('<meta>').attr({name:'crawler:native-id',content:String(p.id)}),$('<meta>').attr({name:'crawler:date-source',content:'public_next_date_and_cms_fixed_offset'}),$('<meta>').attr({name:'crawler:source-api',content:metadataUrl}),$('<script type="application/ld+json">').text(JSON.stringify({'@type':'NewsArticle',url:p.link,headline:p.title,datePublished:published,isAccessibleForFree:true}).replace(/</g,'\\u003c')));
 if(author)$('head').append($('<meta>').attr({name:'author',content:author}));
 return {html:$.html(),nativeDate:p.date,offsetMinutes:offset,publicationTimezoneScope:'CMS fixed offset; not an offset declared separately on each article'};
}
