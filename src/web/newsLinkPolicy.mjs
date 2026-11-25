// URL shapes confirmed by the full-cycle error corpus. A listing/profile is
// never promoted to an article merely because its anchor has a long headline.
export function classifyNewsLink(raw,domain){
 let u;try{u=new URL(raw);}catch{return {kind:'excluded',reason:'invalid_url'};}
 domain=String(domain||u.hostname).toLowerCase().replace(/^www\./,'');
 let p;try{p=decodeURIComponent(u.pathname);}catch{p=u.pathname;}
 if(domain==='vnexpress.net'&&/^\/oto-xe-may\/thi-bang-lai\/ly-thuyet(?:\/|$)/i.test(p)&&!/-\d{6,}\.html?$/i.test(p))return {kind:'excluded',reason:'publisher_driving_exam_utility'};
 if(domain==='vntravel.org.vn'&&/^\/user\/[^/]+\/?$/i.test(p))return {kind:'excluded',reason:'publisher_author_profile'};
 if(['vn.stockproxx.com','stockproxx.com'].includes(domain)&&/^\/doanh-nghiep-chua-niem-yet\/?$/.test(p))return {kind:'listing',reason:'publisher_business_news_section'};
 if(domain==='thepaypers.com'&&/^\/payments\/(?:reports|webinars)(?:\/|$)/i.test(p))return {kind:'excluded',reason:'publisher_report_or_webinar_resource'};
 if(domain==='nhandan.vn'&&/^\/ocop\/.*-prod\d+\.html$/i.test(p))return {kind:'excluded',reason:'product_catalog_page'};
 if(domain==='websosanh.vn'&&(/\/direct\.htm\/?$/i.test(p)||/\/\d+\/so-sanh\.htm\/?$/i.test(p)))return {kind:'excluded',reason:'product_offer_redirect'};
 if(domain==='brandsvietnam.com'&&/^\/jobs?(?:\/|$)/i.test(p))return {kind:'excluded',reason:'publisher_recruitment_page'};
 if(domain==='voz.vn'&&(/^\/p\/\d+\/?$/i.test(p)||/\/(?:post-\d+|page-\d+)\/?$/i.test(p)))return {kind:'excluded',reason:'forum_reply_or_pagination'};
 if(p==='/'&&!['id','id8','newsid','articleid','p'].some(k=>/^\d+$/.test(u.searchParams.get(k)||'')))return {kind:'listing',reason:'homepage'};
 if(/\/(?:tu-khoa|keywords?|hashtag|archives?)(?:[/.]|$)/i.test(p)||/\.(?:tag|topic)(?:\/)?$/i.test(p)||/[-/](?:p?tag|event)\d*(?:\.[a-z]+)?\/?$/i.test(p)||/^\/tag\d+(?:[-/]|$)/i.test(p))return {kind:'listing',reason:'tag_topic_or_author_archive'};
 if(/\/(?:search_enginer|search-engine)(?:[/.]|$)/i.test(p)||/-search\/?$/i.test(p)||[...u.searchParams.keys()].some(k=>/^(?:q|s|keyword|keywords|search|searchword|searchtime|tag|tags|cat|category)$/i.test(k)))return {kind:'listing',reason:'search_or_archive_query'};
 if(/\/(?:wp-content|wp-includes|attachment|attachments|cms)(?:\/|$)/i.test(p)||/\/(?:player|embed)\.php$/i.test(p))return {kind:'excluded',reason:'asset_embed_or_cms'};
 if([...u.searchParams].some(([k,v])=>/^(?:print|output)$/i.test(k)&&/^(?:1|true|print)$/i.test(v)))return {kind:'excluded',reason:'print_version_of_article'};
 if(domain==='baochinhphu.vn'&&/^\/print\//i.test(p))return {kind:'excluded',reason:'print_version_of_article'};
 if(domain==='baoquocte.vn'&&/^\/bao-in\/.+\.paper$/i.test(p))return {kind:'excluded',reason:'printed_edition_reader'};
 if([...u.searchParams].some(([key,value])=>/^(page|paged|trang|pageindex|pagenum)$/i.test(key)&&/^\d+$/.test(value)&&Number(value)>1))return {kind:'listing',reason:'archive_pagination'};
 if(domain==='tuoitre.vn'&&/-e\d+\.htm$/.test(p))return {kind:'listing',reason:'native_event_id'};
 if(domain==='vtcnews.vn'&&(/^\/tieu-diem\//i.test(p)||/^\/[^/]+-\d{1,3}\.html$/i.test(p)))return {kind:'listing',reason:'publisher_section_or_topic'};
 if(domain==='znews.vn'&&(/^\/tieu-diem\//i.test(p)||/-(?:tin-tuc|tieu-diem)\.html$/i.test(p)))return {kind:'listing',reason:'tag_topic_or_author_archive'};
 if(domain==='prnewswire.com'&&/-list\/$/i.test(p))return {kind:'listing',reason:'publisher_section_or_topic'};
 if(domain==='cryptoslate.com'&&/^\/(?:coins|directory)\/[^/]+\/?$/i.test(p))return {kind:'excluded',reason:'market_quote_or_coin_directory'};
 if(domain==='dantri.com.vn'&&['/lao-dong-viec-lam.htm','/tinh-yeu-gioi-tinh.htm'].includes(p))return {kind:'listing',reason:'native_category_page'};
 if(['autovn.com.vn','kinhtenews.com','phunustyle.vn'].includes(domain)&&/^\/search\/label\/[^/]+\/?$/.test(p)&&!u.search)return {kind:'listing',reason:'verified_blogger_label_category'};
 if(domain==='vietnamfdi.vn'&&/-\d{1,2}\.html$/.test(p))return {kind:'listing',reason:'native_category_id'};
 if(domain==='vietq.vn'&&/-su-kien-\d+\/$/.test(p))return {kind:'listing',reason:'native_event_archive'};
 const utilityRoutes={'kenh14.vn':['/adv.chn'],'anninhthudo.vn':['/gui-bai.antd','/tra-cuu-xe.antd'],'baodauthau.vn':['/thanh-toan-dien-tu.html'],'cafebitcoin.org':['/tuyen-bo-tu-choi-trach-nhiem/'],'cuoi.tuoitre.vn':['/gui-bai.htm','/gamezone.htm'],'ambcrypto.com':['/careers/']};
 if(utilityRoutes[domain]?.includes(p))return {kind:'excluded',reason:'verified_publisher_utility_route'};
 if(domain==='dantri.com.vn'&&/^\/the-thao\/(?:lich-thi-dau|bang-xep-hang|ket-qua)(?:\/|\.htm$)/.test(p))return {kind:'excluded',reason:'sports_schedule_or_scoreboard'};
 if(/^\/(?:master_ads|widgets@)(?:\/|$)/.test(p))return {kind:'excluded',reason:'publisher_widget_or_advertising'};
 if(domain==='thuonghieuvaphapluat.vn'&&/-su-kien-\d+\/$/.test(p))return {kind:'listing',reason:'native_event_archive'};
 if(['cafedautu.vn','congnghevadoisong.vn','danviet.vn','doanhnhantrevietnam.vn','nhadautu.vn','taichinhdoanhnghiep.net.vn','theinvestor.vn','thitruongbiz.vn'].includes(domain)&&/-channel\d+\/?$/i.test(p))return {kind:'listing',reason:'native_topic_channel'};
 if(domain==='vietcetera.com'&&/^\/(?:vn|en)\/thong-tin-ca-nhan\//.test(p))return {kind:'excluded',reason:'author_or_member_profile'};
 if(domain==='baohatinh.vn'&&/^\/cong-cu\//.test(p)||domain==='langsontv.vn'&&/^\/faqs\//.test(p)||domain==='cryptoslate.com'&&/^\/disclaimers\//.test(p))return {kind:'excluded',reason:'utility_or_policy_document'};
 if(['baodongthap.vn','truyenhinh.baobinhduong.vn'].includes(domain)&&/^\/xem-bao\//.test(p))return {kind:'excluded',reason:'printed_edition_reader'};
 if(/^\/(?:about-us|contact-us|advertise(?:-with-us)?|advertising|our-authors|editorial-policy|privacy-policy|terms-of-use|disclaimers|sitemap)(?:\/|\.html?)?$/i.test(p))return {kind:'excluded',reason:'utility_or_account'};
 if(domain==='24h.com.vn'&&/^\/mxh\/[^/]+-tp\d+\.html$/i.test(p))return {kind:'excluded',reason:'community_topic_profile'};
 if(!/^https?:$/.test(u.protocol)||u.username||u.password)return {kind:'excluded',reason:'invalid_url'};
 if(/\/(?:https?:|ttps:|undefined|null)(?:\/|$)/i.test(p)||/%(?:20|0a|0d)/i.test(p)&&/facebook|fanpage/i.test(p))return {kind:'excluded',reason:'malformed_link'};
 if(/\.(?:jpe?g|png|webp|gif|svg|mp[34]|m3u8|pdf|zip|xml|rss|js|css|woff2?|ttf)$/i.test(p))return {kind:'excluded',reason:'asset_or_feed'};
 if(/\/(?:admin|administrator|wp-admin|wp-login(?:\.php)?|cdn-cgi|login|register|dang-nhap|dang-ky|members|contact|lien-he|privacy|terms|dieu-khoan(?:-su-dung)?|chinh-sach(?:-bao-mat)?|gioi-thieu|about|tuyen-dung|subscriptions?|subscribe|account|my-account)(?:[/.]|$)/i.test(p))return {kind:'excluded',reason:'utility_or_account'};
 const nativeStoryInSection=domain==='antv.gov.vn'&&/^\/su-kien\/.+-\d{6,}\.html$/i.test(p)||domain==='trangcongnghe.com'&&/^\/topics\/[^/]+\/\d{4,}-.+\.html$/i.test(p);
 if(!nativeStoryInSection&&/\/(?:tags?|hashtag|tim-kiem|search|authors?|tac-gia|dong-su-kien|chu-de|chuyen-de|su-kien|topics?|events?)(?:[/.]|$)/i.test(p)||/[-/](?:tag|event)\d+(?:\.html?)?$/i.test(p))return {kind:'listing',reason:'tag_topic_or_author_archive'};
 if(/\/(?:page|trang)\/(?:[2-9]|[1-9]\d+)(?:\/|\.html?)?$/i.test(p)||/-p(?:[2-9]|[1-9]\d+)\.html?$/i.test(p)&&!(domain==='luxuo.vn'||['lyluanchinhtrivatruyenthong.vn','tv.nguoiduatin.vn','tapchithangmay.vn'].includes(domain)&&/-p\d{3,}\.html?$/i.test(p)))return {kind:'listing',reason:'archive_pagination'};
 if(/-c\d+(?:-p\d+)?\.html?$/i.test(p)||/-(?:cd|cn)\d+\/?$/i.test(p))return {kind:'listing',reason:'native_category_id'};
 if(domain==='vneconomy.vn'&&/-e\d+\.htm$/.test(p))return {kind:'listing',reason:'tag_topic_or_author_archive'};
 if(domain==='baodautu.vn'&&/-d\d+\/$/.test(p))return {kind:'listing',reason:'native_category_id'};
 if(/-c\d+e\d+\.html?$/i.test(p))return {kind:'listing',reason:'native_event_id'};
 if(domain==='bnews.vn'&&/^\/(?!photo\/)[^/]+\/\d+\/trang-1\.html$/.test(p))return {kind:'listing',reason:'native_category_page'};
 if(domain==='2sao.vn'&&/-sk[a-z\d]+\.html$/i.test(p))return {kind:'listing',reason:'native_event_id'};
 if(domain==='baomoi.com'&&/-p\d+\.epi$/.test(p))return {kind:'listing',reason:'publisher_directory'};
 if(domain==='baomoi.com'&&/^\/bong-da\/[^/]+-(?:giai-dau|tran-dau|doi-bong|cau-thu)-\d+\.epi$/.test(p))return {kind:'listing',reason:'sports_directory'};
 if(domain==='bazaarvietnam.vn'&&/^\/thuong-hieu\//.test(p))return {kind:'excluded',reason:'brand_directory'};
 if(domain==='asemconnectvietnam.gov.vn'&&/^\/BusinessIntro\.aspx$/i.test(p))return {kind:'excluded',reason:'business_directory'};
 if(/\/adsfw\//i.test(p))return {kind:'excluded',reason:'advertising_redirect'};
 if(domain==='beforeitsnews.com'&&/^\/contributor\/pages\/.+\/bio\.html$/i.test(p))return {kind:'excluded',reason:'contributor_profile'};
 if(domain==='video.afamily.vn'&&/^\/playlist\//i.test(p))return {kind:'listing',reason:'video_playlist'};
 if(domain==='bongdaplus.vn'&&/-tags$/i.test(p))return {kind:'listing',reason:'tag_topic_or_author_archive'};
 if(domain==='vietnamnet.vn'&&/-sk[a-z\d]+\.html$/i.test(p)||domain==='thethaovanhoa.vn'&&/-e\d+\.htm$/i.test(p)||domain==='vietnam.vnanet.vn'&&/-(?:sub-\d+-\d+|cdp-\d+)\.html$/i.test(p))return {kind:'listing',reason:'native_event_id'};
 if(['tienphong.vn','ngaymoionline.com.vn','vjst.vn','vietnamhoinhap.vn','congly.vn','htv.vn','kiemsat.vn'].includes(domain)&&/\/(?:epaper|tap-chi-in|an-pham|publication\/public-publication)(?:\/|$)/i.test(p))return {kind:'excluded',reason:'printed_edition_reader'};
 if(domain==='congngheviet.com'&&/^\/lich-van-nien(?:\/|$)/i.test(p))return {kind:'excluded',reason:'calendar_utility'};
 if(domain==='doisongphapluat.nguoiduatin.vn'&&/^\/ev\d+\//i.test(p)||domain==='tapchikinhtetaichinh.vn'&&/\.topic$/i.test(p))return {kind:'listing',reason:'native_event_id'};
 if(['congthuong.vn','langngheviet.com.vn'].includes(domain)&&/\.paper$/i.test(p))return {kind:'excluded',reason:'printed_edition_reader'};
 if(/\/(?:category|categories|danh-muc|chuyen-muc|section)\//i.test(p)&&!/(?:[-/]\d{5,}|post\d{4,})[^/]*$/.test(p))return {kind:'listing',reason:'category_path'};
 if(['vietstock.vn','en.vietstock.vn'].includes(domain)&&/\.html?$/i.test(p)&&!/^\/\d{4}\/\d{2}\//.test(p)&&!/-\d{5,}(?:-\d+)?\.html?$/i.test(p))return {kind:'listing',reason:'stock_news_section'};
 if(domain==='bongda24h.vn'&&/^\/(?:cau-thu|doi-bong|truc-tiep-ket-qua|livescore|bang-xep-hang)(?:\/|$)/i.test(p)&&!/^\/doi-bong\/.+-\d+-\d{5,}\.html$/i.test(p))return {kind:'excluded',reason:'sports_profile_or_scoreboard'};
 if(domain==='markets.businessinsider.com'&&/^\/(?:stocks|indices|commodities|cryptocurrencies|currencies|etfs|bonds|funds|insidertrades|earnings-calendar)(?:\/|$)/i.test(p))return {kind:'excluded',reason:'market_quote_or_calendar'};
 if(domain==='vtv.vn'&&/^\/truyen-hinh-truc-tuyen(?:\/|$)/.test(p))return {kind:'excluded',reason:'broadcast_schedule_or_live_channel'};
 if(domain==='giacaphe.com'&&/^\/gia-ca-phe-noi-dia-ngay-\d{4}-\d{2}-\d{2}\/?$/.test(p))return {kind:'excluded',reason:'daily_market_table'};
 if(domain==='ambcrypto.com'&&/^\/coins\/[^/]+\/?$/i.test(p))return {kind:'excluded',reason:'market_quote_or_coin_directory'};
 if(domain==='24hmoney.vn'&&/^\/users\//.test(p))return {kind:'excluded',reason:'user_profile'};
 if(domain==='techsignin.com'&&/^\/r\/thread\//.test(p))return {kind:'excluded',reason:'forum_thread'};
 if(domain==='dantri.com.vn'&&p==='/kinh-doanh/amaccao-vuon-minh-cung-ky-nguyen-moi.htm')return {kind:'listing',reason:'native_category_id'};
 const nativeArticleShapes={
  'tienphong.vn':/-(?:post)?\d{4,}\.tpo$/i,
  'hoahoctro.tienphong.vn':/-(?:post)?\d{4,}\.tpo$/i,
  'svvn.tienphong.vn':/-(?:post)?\d{4,}\.tpo$/i,
  'vhds.baothanhhoa.vn':/-\d+\.htm$/i,
  'thuonghieuvaphapluat.vn':/-d\d+\.html(?:\.(?:photo|video))?$/i,
  '1thegioi.vn':/-\d{5,}\.html?$/i,'baodanang.vn':/-\d{5,}\.html?$/i,
  'afamily.vn':/-\d{8,}\.(?:chn|html?)$/i,
  'thitruongtaichinhtiente.vn':/-\d{4,}\.html?$/i,
  'vov.vn':/(?:post\d+|-\d{5,})\.vov$/i
  ,'suckhoedoisong.vn':/-\d{5,}\.html?$/i
  ,'vietnamplus.vn':/(?:-post\d+|[-/]\d{5,})\.vnp$/i
  ,'antt.vn':/[-/]\d{4,}\.html?$/i
  ,'baocaovien.vn':/\/\d{3,}\.html?$/i
  ,'baolaocai.vn':/(?:post\d+|[-/]\d{4,})\.html?$/i
  ,'baodauthau.vn':/(?:post\d+|[-/]\d{4,})\.html?$/i
  ,'baove.congly.vn':/(?:post\d+|[-/]\d{4,})\.html?$/i
 };
 // Confirmed against every successful URL in the original cycle; keep native media routes.
 if(['baochinhphu.vn', 'cuoi.tuoitre.vn', 'dautu.kinhtechungkhoan.vn', 'dongvon.doanhnhanvn.vn', 'hanoimoi.vn', 'money.vtv.vn', 'news.tuoitre.vn', 'nguoiduatin.vn', 'phunuvietnam.vn', 'soha.vn', 'thanhnienviet.vn', 'tiim.com.vn', 'vietnambiz.vn', 'xe.baoxaydung.vn', 'moitruongvaxahoi.vn', 'thethao.sggp.org.vn', 'sggp.org.vn', 'kinhtenongthon.vn', 'nangluongvietnam.vn', 'thoidaiplus.suckhoedoisong.vn', 'doanhnghieptiepthi.vn'].includes(domain))nativeArticleShapes[domain]=/(?:[-/](?:post)?\d{4,}|post\d{4,})\.(?:html?|tpo|vov|epi|vnp|chn)$|[-/]\d+\.media$/i;
 // Round15: numeric IDs, hashed edition paths and native media coexist on these publishers.
 if(['baovinhlong.com.vn', 'baovephapluat.vn', 'congnghiepmoitruong.vn', 'dautuvietnam.com.vn', 'dautuvakinhdoanh.vn', 'doanhnghiephoinhap.vn', 'kiemsat.vn', 'kinhtetieudung.vn', 'qltt.vn', 'techz.vn', 'tieudungvietnam.vn', 'truyenhinhnghean.vn', 'vietnamlawmagazine.vn'].includes(domain))nativeArticleShapes[domain]=/(?:[-/](?:post|a|v)?\d{3,}|post\d{3,})\.(?:html?|tpo|vov|epi|vnp|chn|media)$|\/\d{6}\/.+-[a-f\d]{6,}\/$|-[a-z\d]{8,}\.html?$/i;
 if(nativeArticleShapes[domain]&&!nativeArticleShapes[domain].test(p))return {kind:'listing',reason:'publisher_section_or_topic'};
 return {kind:'unknown',reason:null};
}
