import {publicationPageKey} from './newsPublicationPageIdentity.mjs';
const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
export function verifiedTcdnLongformClock($,url,config,node,title){
 let u;try{u=new URL(url);}catch{return false;}
 if(u.hostname.replace(/^www\./,'')!=='taichinhdoanhnghiep.net.vn'||!/-d\d{4,}\.html$/.test(u.pathname)||config.siteName!=='taichinhdoanhnghiep.net.vn'||config.publicationArticleScope!=='.webpage-container'||config.title?.selector!=='meta[property="og:title"]'||config.title.attribute!=='content'||config.publishedDate?.selector!=='.webpage-container > .menu-emagazine.emaGa .bx-time'||config.body?.selector!=='.webpage-container > article > #content_detail.emanazine')return false;
 const root=$('.webpage-container'),clock=root.find('> .menu-emagazine.emaGa .bx-time'),body=root.find('> article > #content_detail.emanazine'),headline=$('meta[property="og:title"]'),documentTitle=$('head > title'),ogUrl=$('meta[property="og:url"]'),canonical=$('link[rel=canonical]');
 if(root.length!==1||clock.length!==1||node[0]!==clock[0]||body.length!==1||clean(body.clone().find('script,style,nav,footer,.tinlienquan').remove().end().text()).length<150||headline.length!==1||documentTitle.length!==1||clean(headline.attr('content'))!==clean(title)||clean(documentTitle.text())!==clean(title)||ogUrl.length!==1||publicationPageKey(ogUrl.attr('content'),url)!==publicationPageKey(url)||canonical.length>1||canonical.length===1&&publicationPageKey(canonical.attr('href'),url)!==publicationPageKey(url))return false;
 return root.find('> .top-header-logo > .w-1200 > h1 img').length===1;
}
