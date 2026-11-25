const selector='article.article-new > header .post-date';
const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
const owners=new Map([['moit.gov.vn',{host:'moit.gov.vn',kind:'user_confirmed_moit_visible_original_clock_20261117'}],['kinhtetrunguong.vn',{host:'cscltw.dcs.vn',kind:'user_confirmed_cscltw_visible_original_clock_20261117'}]]);
export function verifiedUserVisiblePublicationClock($,url,config,node,title){
 const authority=config.publicationEvidencePolicy,owner=owners.get(config.siteName);if(!owner)return false;
 let current,canonical;try{current=new URL(url);canonical=new URL($('link[rel="canonical"]').attr('href'),url);}catch{return false;}
 if(current.hostname.replace(/^www\./,'')!==owner.host||config.timezone!=='Asia/Ho_Chi_Minh'||config.publicationTimePolicy!=='user_confirmed_vietnam_article_clock'||config.timezoneProvenance?.authority!=='explicit_user_confirmation'||config.timezoneProvenance?.scope!==config.siteName||config.timezoneProvenance?.confirmation!=='displayed_clock_is_vietnam_time_2026-11-17')return false;
 if(authority?.kind!==owner.kind||authority.authority!=='explicit_user_confirmation'||authority.selector!==selector||config.publishedDate?.strategy!=='selector'||config.publishedDate.selector!==selector||config.publishedDate.attribute||config.publishedDate.index)return false;
 if(canonical.hostname.replace(/^www\./,'')!==owner.host||canonical.pathname!==current.pathname||canonical.search!==current.search)return false;
 const nodes=$(selector),root=node?.closest('article.article-new');
 if(nodes.length!==1||!node?.is(selector)||root?.length!==1||root.find('h1').length!==1||clean(root.find('h1').text())!==clean(title)||(owner.host==='moit.gov.vn'?root.children('.article-content'):root.find('.article-content')).length!==1||node.parents('aside,nav,footer,related-content,[class*="related"],[class*="recommend"]').length)return false;
 const text=clean(node.text());return /\d{1,2}\/\d{1,2}\/\d{4}/.test(text)&&/\d{1,2}:\d{2}/.test(text)&&!/cập nhật|updated|modified/i.test(text);
}
