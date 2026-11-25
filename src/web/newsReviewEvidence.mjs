import * as cheerio from 'cheerio';

function prefix(text,bytes){
  const b=Buffer.from(text);if(b.length<=bytes)return text;
  let end=bytes;while(end>0&&(b[end]&0xc0)===0x80)end--;
  return b.subarray(0,end).toString('utf8');
}

// Keep native article structure in the bounded review input. A document prefix
// can consist entirely of menus even when the article is present much later.
export function newsReviewEvidence(html,limit=4000){
  const $=cheerio.load(html),metadata=[];
  for(const e of $('head title,head link[rel="canonical"],head meta[name="description"],head meta[property^="og:"],head meta[property^="article:"],head meta[itemprop="datePublished"],head meta[name="pubdate"]').toArray())metadata.push($.html(e));
  for(const e of $('script[type="application/ld+json"]').toArray()){
    try{const raw=JSON.parse($(e).text()),values=Array.isArray(raw)?raw:raw['@graph']||[raw];for(const v of values){if(!/Article|BlogPosting/.test(String(v?.['@type'])))continue;metadata.push('<script type="application/ld+json">'+JSON.stringify(Object.fromEntries(['@type','@id','url','mainEntityOfPage','headline','datePublished','dateModified','isAccessibleForFree'].filter(k=>v[k]!==undefined).map(k=>[k,v[k]])))+'</script>');}}catch{}
  }
  $('script,style,nav,footer,aside,form,svg,noscript,.related,.comments,.advertisement').remove();
  const headings=$('h1,h2[class*="title"],h3[class*="title"]', 'body').toArray().filter(e=>$(e).text().trim().length>=15).slice(0,5).map(e=>$.html(e));
  const clocks=$('time,[itemprop="datePublished"],.article-date,.post-date,.entry-date,.publish-date,.article-time,.detail-time,.publication-date').toArray().slice(0,6).map(e=>$.html(e));
  const containers=$('article,[itemprop="articleBody"],.entry-content,.article-content,.article-body,.detail-content,.post-content,.fck_detail').toArray().filter(e=>$(e).find('p').length||$(e).text().trim().length>200).sort((a,b)=>$(b).find('p').length-$(a).find('p').length);
  const node=containers.find(e=>$(e).find('h1,h2[class*="title"],h3[class*="title"]').length)||containers[0];
  let body='';if(node){const clone=$(node).clone();clone.find('img,video,audio,iframe,table').remove();const paragraphs=clone.find('p').toArray();for(const [i,e] of paragraphs.entries())if(i>2&&i!==paragraphs.length-1)$(e).remove();body=$.html(clone);}
  if(!body)body=$('p').toArray().filter(e=>$(e).text().trim().length>80).slice(0,3).map(e=>$.html(e)).join('');
  return prefix('<native-head>'+prefix(metadata.join(''),1300)+'</native-head><native-headings>'+prefix(headings.join(''),700)+'</native-headings><native-clocks>'+prefix(clocks.join(''),500)+'</native-clocks><native-body>'+prefix(body,1400)+'</native-body>',limit);
}
