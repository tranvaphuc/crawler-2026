import * as cheerio from 'cheerio';

const apiBase='https://tuyengiaodanvan.vn/api/v1/news/public';
const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function tuyengiaoPublicRequest(url){
 let u;try{u=new URL(url);}catch{return null;}
 if(!['tuyengiao.vn','www.tuyengiao.vn'].includes(u.hostname)||!/^https?:$/.test(u.protocol))return null;
 const match=u.pathname.match(/^\/(?:vn\/)?blogs\/([a-z0-9-]+-[a-f0-9]{24})\/?$/);
 const listing=/^\/(?:vn\/?)?$/.test(u.pathname);
 if(!listing&&!match)return null;
 const filter=match?{where:{slug:match[1],type:'news'},limit:2}:{where:{type:'news'},order:['createdAt DESC'],limit:40};
 return {url:apiBase+'?filter='+encodeURIComponent(JSON.stringify(filter)),slug:match?.[1]||null};
}
function approved(record){return record?.status==='approved'&&record.type==='news'&&/^[a-f0-9]{24}$/.test(record.id||'')&&typeof record.slug==='string'&&/^[a-z0-9-]+$/.test(record.slug)&&record.slug.endsWith('-'+record.id)&&String(record.title||'').trim();}
export function normalizeTuyengiaoPublic(data,url){
 const request=tuyengiaoPublicRequest(url);if(!request)return null;
 const records=Array.isArray(data?.data)?data.data:null;if(!records)return {error:'TUYENGIAO_PUBLIC_RESPONSE_INVALID'};
 const recordsApproved=records.filter(approved);
 if(!request.slug){const links=recordsApproved.map(r=>'<a href="https://tuyengiao.vn/vn/blogs/'+escape(r.slug)+'">'+escape(r.title)+'</a>');return links.length?{html:'<!doctype html><html><head><title>Ban Tuyên giáo Trung ương - Tin tức</title></head><body><main>'+links.join('\n')+'</main></body></html>',articleLinks:links.length}:{error:'TUYENGIAO_PUBLIC_LISTING_EMPTY'};}
 const matches=recordsApproved.filter(r=>r.slug===request.slug);if(matches.length!==1)return {error:'TUYENGIAO_PUBLIC_ARTICLE_IDENTITY_UNCONFIRMED'};
 const record=matches[0];
 // The publisher's BlogPublishDate component renders publishDate ?? createdAt.
 // Preserve that exact ISO instant; updatedAt is never a publication fallback.
 const original=record.publishDate??record.createdAt;
 if(typeof original!=='string'||!/(?:Z|[+-]\d\d:\d\d)$/.test(original)||!Number.isFinite(Date.parse(original)))return {error:'TUYENGIAO_ORIGINAL_PUBLICATION_MISSING'};
 if(typeof record.content!=='string')return {error:'TUYENGIAO_PUBLIC_BODY_MISSING'};
 const $=cheerio.load('<div>'+record.content+'</div>');$('script,style,noscript').remove();const content=$('body > div').html();if($('body > div').text().trim().length<200)return {error:'TUYENGIAO_PUBLIC_BODY_MISSING'};
 const author=record.authorName||record.author?.fullName||record.createdBy?.fullName;
 const schema={'@context':'https://schema.org','@type':'NewsArticle',url,mainEntityOfPage:{'@id':url},headline:record.title,datePublished:original,...(author?{author:{'@type':'Person',name:author}}:{})};
 const html='<!doctype html><html><head><title>'+escape(record.title)+'</title><link rel="canonical" href="'+escape(url)+'"><meta name="description" content="'+escape(record.description||'')+'"><meta name="crawler:source-api" content="'+escape(request.url)+'"><meta name="crawler:native-id" content="'+escape(record.id)+'"><meta name="crawler:date-source" content="publisher_public_news_api_original"><meta name="crawler:publication-match-url" content="'+escape(url)+'"><script type="application/ld+json">'+JSON.stringify(schema).replace(/</g,'\\u003c')+'</script></head><body><article><h1>'+escape(record.title)+'</h1><time datetime="'+escape(original)+'">'+escape(original)+'</time><div class="tuyengiao-public-body">'+content+'</div></article></body></html>';
 return {html,sourceApiUrl:request.url,nativeId:record.id};
}
export async function fetchTuyengiaoPublicPage(page,url,fetch){
 const request=tuyengiaoPublicRequest(url);if(!request||page.statusCode!==200||page.error&&page.error!=='empty_page')return null;
 const response=await fetch(request.url,{taskRole:'publisher_public_api'});if(response.error||!response.html)return {...page,error:response.error||'TUYENGIAO_PUBLIC_API_UNAVAILABLE'};
 let data;try{data=JSON.parse(response.html);}catch{return {...page,error:'TUYENGIAO_PUBLIC_RESPONSE_INVALID'};}
 const normalized=normalizeTuyengiaoPublic(data,url);return {...page,...normalized,error:normalized.error||null,normalization:'publisher_public_news_api',method:'HTTP/axios+publisher-public-api'};
}
