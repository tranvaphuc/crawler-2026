import * as ch from 'cheerio';import {publicationPageKey} from './newsPublicationPageIdentity.mjs';
const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
export function normalizeTcdnNativePhotoArticle(html,url){
 let u;try{u=new URL(url);}catch{return null;}
 if(u.hostname.replace(/^www\./,'')!=='taichinhdoanhnghiep.net.vn'||!/-i\d{4,}\.html$/.test(u.pathname))return null;
 const $=ch.load(html),root=$('.webpage-container'),title=root.find('> .title-photo > .t-photo > h1'),clock=root.find('> .title-photo > .t-photo > .bx-time'),intro=root.find('> .title-photo > .sapo_photo'),body=root.find('> article > #content_detail'),canonical=$('link[rel=canonical]').attr('href')||$('meta[property="og:url"]').attr('content');
 if(root.length!==1||title.length!==1||clock.length!==1||intro.length!==1||body.length!==1||!canonical||publicationPageKey(canonical,url)!==publicationPageKey(url)||clean(title.text()).length<12||!/[0-3]?\d\/[01]?\d\/20\d\d/.test(clean(clock.text())))return {error:'tcdn_photo_original_identity_unconfirmed'};
 const content=body.clone();content.find('script,style,nav,footer,.related,.tinlienquan').remove();
 if(clean(intro.text()).length<30||clean(content.text()).length<30&&!content.find('img,video,iframe').length)return {error:'tcdn_photo_native_body_unconfirmed'};
 $('[data-native-tcdn-photo-gallery]').remove();
 const article=$('<article class="article" data-native-tcdn-photo-gallery="true">').attr('data-native-source-url',url),header=$('<header class="t-photo">'),headline=title.clone().attr('id','getTitle');
 header.append(headline,clock.clone());const fullBody=$('<div class="chuyentintuc" itemprop="articleBody">');fullBody.append(intro.clone(),content);
 article.append(header,fullBody);$('body').append(article);
 return {html:$.html(),normalization:'url_bound_original_native_photo_gallery'};
}
