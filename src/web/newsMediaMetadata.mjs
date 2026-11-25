import * as cheerio from 'cheerio';
const clean=value=>cheerio.load(String(value||''),null,false).text().replace(/\s+/g,' ').trim();
const usable=raw=>typeof raw==='string'&&/^(?:https?:\/\/|\/)/i.test(raw);
export function structuredMediaBody(objects){
 const media=[],images=[],texts=[];
 for(const item of objects){if(!/^(?:VideoObject|AudioObject|PodcastEpisode|RadioEpisode)$/i.test(String(item['@type']))||String(item.isAccessibleForFree).toLowerCase()==='false')continue;
  const url=item.contentUrl||item.embedUrl;if(!usable(url))continue;
  media.push({type:/Audio|Podcast|Radio/i.test(String(item['@type']))?'audio':item.contentUrl?'video':'iframe',url});
  const text=clean(item.transcript||item.description||item.caption);if(text)texts.push(text);
  for(const image of Array.isArray(item.thumbnailUrl)?item.thumbnailUrl:[item.thumbnailUrl]){const url=typeof image==='string'?image:image?.url;if(usable(url))images.push({url,caption:clean(item.name)});}
 }
 if(!media.length)return null;const text=[...new Set(texts)].join('\n');return {selector:'jsonld.media',text,images,media,paragraphs:text?1:0,linkRatio:0,length:text.length};
}
