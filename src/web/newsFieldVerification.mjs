import {verifyNativeVideoMissingDescription} from './newsNativeVideoDescription.mjs';
import * as cheerio from 'cheerio';
import {matchesVisibleNewsDescription} from './newsDescription.mjs';

const clean=value=>String(value||'').normalize('NFC').replace(/\s+/g,' ').trim();
const compare=value=>clean(value).toLowerCase().replace(/[“”‘’"']/g,'');
const selectors=['[itemprop="articleBody"]','.afcbc-body','#af-detail-content','.fck_detail','.knc-content','.detail-content','.detail-cmain','.article-body','.article__body','.article-content','.the-article-body','.cms-body','.entry-content','.post-content','.c-news-detail'];
const excluded='script,style,noscript,nav,footer,form,aside,.related,.comments,.comment-list,.c-comments,.onecms__comments,.c-comment-input,.ads,.advertisement,[class*="related"],[class*="recommend"],table.__MB_ARTICLE_A,table.__mb_article_in_image,blockquote.footer_nesw_detail';

// Independent read-only check: never synthesize a missing field or change parser output.
export function verifyNewsFields(html,parsed,{dom}={}){
 const $=dom||cheerio.load(html),doc=parsed?._source||{},extracted=parsed?.extracted||{},issues=[];
 const headline=clean($('h1').first().text());
 const description=clean(doc.description),metaDescription=clean($('meta[name="description"]').attr('content')),ogDescription=clean($('meta[property="og:description"]').attr('content'));
 const sapo=$('.knc-sapo,.detail-sapo,.article-sapo,.article__sapo,.afcbc-sapo,.sapo,[itemprop="description"]').toArray().filter(e=>!$(e).parents('nav,footer,aside,.related,.comments').length).map(e=>clean($(e).text())).filter(Boolean);
 const descriptionEvidence={source:description&&description===metaDescription?'meta_description':description&&description===ogDescription?'og_description':matchesVisibleNewsDescription($,parsed)?'visible_article_sapo':null,metaDescription,ogDescription,visibleSapo:[...new Set(sapo)].slice(0,3)};
 if(!description&&!verifyNativeVideoMissingDescription($,parsed))issues.push({code:'missing_description',nativeSapoAvailable:sapo.length>0});
 else if(description&&!descriptionEvidence.source)issues.push({code:'description_source_not_matched'});
 const scopes=[],seen=new Set(),body=compare(doc.content),paragraphMatches=new Map();
 if(extracted.bodySelector){let selected;try{selected=$(extracted.bodySelector);}catch{selected=$([]);}if(selected.length===1&&selected.is('.box-content.content-list')&&selected.parents('.timeline').length&&!selected.closest('[itemprop="articleBody"]').length&&selected.find('article.story[data-id]').length>=2)issues.push({code:'body_selector_points_to_related_listing'});}
 const bylines=$('[itemprop="author"],.article__author,.article-author,.author-name').toArray().map(e=>compare($(e).text())).filter(Boolean);
 if(extracted.authorWasFallback===false&&typeof doc.author==='string')bylines.push(compare(doc.author));
 if(extracted.mediaOnly&&body&&bylines.includes(body))issues.push({code:'native_media_body_contains_only_byline'});
 for(const selector of selectors){
  for(const element of $(selector).toArray().slice(0,3)){
   if(seen.has(element))continue;seen.add(element);
   const original=$(element);if(original.parents('nav,footer,aside,.related,.comments').length)continue;
   const clone=original.clone();clone.find(excluded).remove();clone.find('br').replaceWith(' ');
   const paragraphs=[...new Set(clone.find('p').toArray().map(e=>clean($(e).text())).filter(s=>s.length>=60))];
   const chars=paragraphs.reduce((n,p)=>n+p.length,0),text=clean(clone.text());
   const linkChars=clone.find('a').toArray().reduce((n,e)=>n+clean($(e).text()).length,0);
   if(chars<500||paragraphs.length<2||linkChars/Math.max(1,text.length)>0.2)continue;
   const missing=paragraphs.filter(p=>{if(!paragraphMatches.has(p))paragraphMatches.set(p,body.includes(compare(p)));return !paragraphMatches.get(p);}),missingChars=missing.reduce((n,p)=>n+p.length,0);
   scopes.push({selector,paragraphs:paragraphs.length,chars,missingParagraphs:missing.length,coverage:1-missingChars/chars,missingPreviews:missing.slice(0,3).map(s=>s.slice(0,200))});
  }
 }
 const strongest=scopes.sort((a,b)=>b.chars-a.chars)[0]||null;
 if(strongest&&strongest.coverage<0.9&&!extracted.mediaOnly)issues.push({code:'native_paragraph_coverage_requires_review',...strongest});
 return {issues,headline,descriptionEvidence,paragraphEvidence:strongest,
  contentKind:extracted.mediaOnly||doc.content==='Images/Video'?'media':'text',
  scope:'Automated evidence check, not a manual semantic certification'};
}

export function sharedDescriptionWarnings(checks){
 const groups=new Map();
 for(const c of checks){const description=clean(c.description),title=clean(c.title);if(!description||!title)continue;const titles=groups.get(description)||new Set();titles.add(title);groups.set(description,titles);}
 return [...groups].filter(([,titles])=>titles.size>=3).map(([description,titles])=>({description,distinctTitles:titles.size,code:'shared_description_requires_article_specific_review'}));
}
