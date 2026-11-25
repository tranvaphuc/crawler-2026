import fs from 'node:fs';
const observedDateProfiles=JSON.parse(fs.readFileSync(new URL('../../config/web-sources/news-date-overrides.json',import.meta.url),'utf8'));
// Overrides come from observed public article HTML; the resulting config is still
// validated unchanged against separate held-out article pages before it can pass.
export const newsSiteProfiles = {
  ...observedDateProfiles,
  ...Object.fromEntries(['doanhnghieptoday.net','xemgame.com','kawowo.com','bstyle.vn','briefs.co','navigator.com.vn','nhipsongkinhte.com','autotimes.vn','anhsangvacuocsong.vn','kenhtinviet.com','mevacon.com.vn'].map(domain=>[domain,{...observedDateProfiles[domain],httpAdapter:'declared_public_wordpress_post'}])),
  'thuongtruong24h.vn':{date:'.dt-news__body .tacgia-area .datetime',dateSelectorOnly:true,timezone:'Asia/Ho_Chi_Minh'},
  'vietq.vn':{date:'article.detail-art > .datetimeup',dateSelectorOnly:true,timezone:'Asia/Ho_Chi_Minh'},
  'suckhoecong.vn':{date:'section.box-author .info-author > ul > li:first-child',dateSelectorOnly:true,timezone:'Asia/Ho_Chi_Minh'},
  'vtv.vn':{...observedDateProfiles['vtv.vn'],httpAdapter:'vtv_public_video_attributes'},
  'baodautu.vn':{...observedDateProfiles['baodautu.vn'],httpAdapter:'baodautu_public_longform_blocks'},
  '2saigon.vn':{title:'h1.post-title-single'},
  'dongvon.doanhnhanvn.vn':{title:'h2.title'},
  'qltt.vn':{title:'h1.article-detail-title'},
  'tamnhin.kienthuc.net.vn':{title:'h1.article__title'},
  'asemconnectvietnam.gov.vn': {title:'h3',date:'.panel-body > i',body:'.panel-body',timezone:'Asia/Ho_Chi_Minh'},
  'consosukien.vn': {title:'h1',date:'.tool-before-article .col:first',body:'.content-wrap-article-detail',timezone:'Asia/Ho_Chi_Minh'}
};
