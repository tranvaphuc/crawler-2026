import test from 'node:test';import assert from 'node:assert/strict';import * as cheerio from 'cheerio';
import {normalizeCamauOriginal,camauOriginalConfig,camauMissingDescriptionPolicy,camauMediaProofMatches} from '../src/web/camauOriginalNews.mjs';
import {parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';
const photo='https://baocamau.vn/original-notice-a134472.html',video='https://baocamau.vn/video/xem-video/original-video-12988.html';
const title='A complete original native publisher headline';
const image='https://baocamau.vn/image/ckeditor/2026/20261118/images/native.png';
const fixture=(url=photo,overrides={})=>{
 const isVideo=url===video,id=isVideo?'12988':'134472',headline=overrides.title||title;
 return `<html><head><meta property="og:url" content="${overrides.og||url}"><meta property="og:title" content="${headline}"><meta name="description" content="${overrides.description||''}"></head><body><div class="current-date">20/11/2026 00:40:00</div>${isVideo?`<div class="main-video-section"><div class="ratio"><iframe src="https://www.youtube.com/embed/MB_Ec_EbmHA" title="${headline}"></iframe></div></div><div class="video-information"><h1>${headline}</h1><p class="mt-1">19/11/2026 16:47</p><div class="video-description"></div></div>`:`<div id="post-detail"><h1>${headline}</h1><div class="post-date">18 tháng 11 2026 14:54</div><div id="post-content"><h4><img src="https://baocamau.vn/images/header/logo.png"></h4><style>UNRELATED_STYLE</style><p><img src="${image}"></p></div></div><script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle',name:headline,datePublished:overrides.date||'2026-11-18 14:54:30',description:''})}</script>`}<script>$.ajax({data: {type:'${isVideo?'video':'news'}',id:${overrides.id||id}}});</script><aside><img src="https://baocamau.vn/image/ckeditor/unrelated.png"></aside></body></html>`;
};
test('Cà Mau scopes native media and original clock, removing publisher logo and retaining an empty description',()=>{
 for(const url of [photo,video]){const out=normalizeCamauOriginal(fixture(url),url);assert(out?.html);const $=cheerio.load(out.html),scope=$('#crawler-camau-native');assert.equal(scope.find('h1').text(),title);assert.equal(scope.find('.article-sapo').text(),'');assert(!scope.html().includes('logo.png'));assert(!scope.html().includes('unrelated.png'));assert(!scope.html().includes('UNRELATED_STYLE'));assert.equal(scope.find('.article-date').text(),url===photo?'2026-11-18 14:54:30':'2026-11-19 16:47');assert.equal(normalizeCamauOriginal(out.html,url).html,out.html);}
});
test('wrong original identity or disagreeing publication clocks cannot be normalized',()=>{
 for(const overrides of [{og:'https://baocamau.vn/another-a134473.html'},{date:'2026-11-18 15:54:30'},{id:'134473'}])assert.equal(normalizeCamauOriginal(fixture(photo,overrides),photo).error,'camau_original_identity_or_clock_unconfirmed');assert.equal(normalizeCamauOriginal(fixture(),photo.replace('baocamau.vn','fireant.vn')),null);
});
test('media preservation does not authorize defaulting an unconfirmed timezone or an unapproved empty description',()=>{
 const config=camauOriginalConfig(),html=normalizeCamauOriginal(fixture(),photo).html;
 assert.equal(camauMissingDescriptionPolicy(config),true);assert(parseConfiguredArticle(html,photo,config).error);
 assert.equal(camauMediaProofMatches({_source:{url:photo,description:'',content:'Images/Video'}},{}),false);
});
