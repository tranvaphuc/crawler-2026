import * as cheerio from 'cheerio';
const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
export function normalizeThePaypersArticle(html,url){
 const u=new URL(url),parts=u.pathname.replace(/\/$/,'').split('/').filter(Boolean);
 if(u.hostname.replace(/^www\./,'')!=='thepaypers.com'||parts.length!==3)return null;
 const $=cheerio.load(html);let t;
 try{t=JSON.parse($('#__NUXT_DATA__').text());}catch{return {error:'thepaypers_native_state_missing'};}
 if(!Array.isArray(t)||t.length>100000)return {error:'thepaypers_native_state_invalid'};
 const ref=i=>Number.isInteger(i)&&i>=0&&i<t.length?t[i]:undefined;
 const unwrap=i=>{const v=ref(i);return Array.isArray(v)&&['ShallowReactive','Reactive','Ref','ShallowRef'].includes(v[0])?ref(v[1]):v;};
 const root=unwrap(0),data=root&&unwrap(root.data),payload=data&&ref(data['use-article-'+parts.join('-')]),p=payload&&ref(payload.results);
 const route=ref(root?.path);
 if(!root||typeof route!=='string'||route.replace(/\/$/,'')!==u.pathname.replace(/\/$/,'')||!p||!ref(p.id)||ref(payload.shouldRedirect)!==false
  ||ref(p.slug)!==parts[2]||ref(ref(p.domain)?.slug)!==parts[0]||ref(ref(p.content_type)?.slug)!==parts[1])return {error:'thepaypers_native_identity_mismatch'};
 if(ref(p.availability)!=='Free')return {error:'thepaypers_publisher_restricted'};
 const title=clean(ref(p.title)),date=ref(p.published_at),canonical=$('link[rel=canonical]').attr('href');
 if(!title||!$('h1').toArray().some(e=>clean($(e).text())===title)||!canonical||new URL(canonical,url).pathname!==u.pathname
  ||new URL(canonical,url).hostname.replace(/^www\./,'')!==u.hostname.replace(/^www\./,''))return {error:'thepaypers_native_headline_mismatch'};
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:?\d\d)$/.test(date||''))return {error:'thepaypers_original_clock_missing'};
 const blocks=ref(p.content);if(!Array.isArray(blocks))return {error:'thepaypers_native_body_missing'};
 const chunks=[],ignored=new Set(['ContentItemTitleSubBlock','ContentItemAuthorSubBlock','ContentItemTagsSubBlock','RelatedSponsoredContentBlock','RelatedContentWideBlock','ContentOverviewBlock']);
 for(const id of blocks){const b=ref(id),kind=ref(ref(b?.component)?.markup),values=ref(b?.propertyValues);
  if(kind==='RichTextBlock'){const content=ref(values?.content);if(typeof content!=='string')return {error:'thepaypers_native_body_missing'};chunks.push(content);}
  else if(!ignored.has(kind))return {error:'thepaypers_native_content_block_unconfirmed'};
 }
 const body=chunks.join('\n'),native=cheerio.load(body),display=$('body').clone();display.find('script,style,noscript').remove();const visible=clean(display.text());
 if(clean(native.text()).length<300||native('p').toArray().some(e=>{const text=clean(native(e).text());return text.length>=60&&!visible.includes(text);} ))return {error:'thepaypers_visible_body_mismatch'};
 const description=clean(cheerio.load(ref(p.abstract)||'').text());
 const out=cheerio.load('<html><head></head><body><article><h1></h1><div class="article-sapo"></div><div class="article-content"></div></article></body></html>');
 out('h1').text(title);out('.article-sapo').text(description);out('.article-content').html(body);
 out('head').append(out('<link>').attr({rel:'canonical',href:u.href}),out('<meta>').attr({name:'description',content:description}),out('<meta>').attr({property:'article:published_time',content:date}),out('<meta>').attr({name:'crawler:native-id',content:String(ref(p.id))}),out('<meta>').attr({name:'crawler:date-source',content:'public_nuxt_published_at'}),out('<meta>').attr({name:'crawler:source-api',content:u.href}));
 const image=$('meta[property="og:image"]').attr('content');if(image)out('head').append(out('<meta>').attr({property:'og:image',content:image}));
 out('head').append(out('<script type="application/ld+json">').text(JSON.stringify({'@type':'NewsArticle',url:u.href,headline:title,datePublished:date}).replace(/</g,'\\u003c')));
 return {html:out.html(),nativeId:String(ref(p.id)),publicationDate:date};
}
