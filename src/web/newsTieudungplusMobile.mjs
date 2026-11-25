import * as cheerio from 'cheerio';
import {publicationPageKey} from './newsPublicationPageIdentity.mjs';

// The desktop publisher declares this exact mobile host in rel=alternate.
// Keep the original article URL for publication-feed lookup and legacy ES IDs.
export async function fetchTieudungplusMobileArticle(url,fetchPage){
 let original;try{original=new URL(url);}catch{return null;}
 if(original.protocol!=='https:'||original.hostname!=='tieudungplus.vn'||original.username||original.password||original.port||!/^\/[^/]+-\d{3,}\.html$/.test(original.pathname))return null;
 const mobile=new URL(original);mobile.hostname='m.tieudungplus.vn';
 const page=await fetchPage(mobile.href,{taskRole:'article'});
 const fail=error=>({...page,requestedUrl:url,sourceTransportUrl:mobile.href,error});
 if(page.error||!page.html)return fail(page.error||'MOBILE_PUBLISHER_EMPTY');
 const landed=new URL(page.finalUrl||mobile.href);
 if(landed.protocol!=='https:'||landed.hostname!==mobile.hostname||landed.pathname!==mobile.pathname||landed.search!==mobile.search)return fail('MOBILE_PUBLISHER_UNEXPECTED_REDIRECT');
 const $=cheerio.load(page.html),canonical=$('head link[rel="canonical"]'),headings=$('.post > h1.post_title'),body=$('article.post_main_content[itemprop~="articleBody"]');
 if(canonical.length!==1||publicationPageKey(canonical.attr('href'),mobile.href)!==publicationPageKey(url))return fail('MOBILE_PUBLISHER_CANONICAL_MISMATCH');
 if(headings.length!==1||headings.text().trim().length<12||body.length!==1)return fail('MOBILE_PUBLISHER_ARTICLE_IDENTITY_MISSING');
 if(/isAccessibleForFree["']?\s*:\s*(?:false|["']false["'])/i.test(page.html)||body.find('.paywall-message,[data-paywall]').length)return fail('publisher_restricted_preview');
 const content=body.clone();content.find('script,style,nav,footer,form,.related,.comments,.ads,.advertisement').remove();
 if(content.text().replace(/\s+/g,' ').trim().length<500||content.find('p').length<2)return fail('MOBILE_PUBLISHER_INCOMPLETE_BODY');
 return {...page,requestedUrl:url,finalUrl:url,sourceTransportUrl:mobile.href,normalization:'publisher_declared_mobile_article',method:'HTTP/publisher-declared-mobile',error:null};
}
