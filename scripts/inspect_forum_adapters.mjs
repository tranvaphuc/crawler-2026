import fs from 'node:fs/promises';import * as c from 'cheerio';
const root='outputs/forum-flow-evidence-2026-11-17';
for(const file of (await fs.readdir(root)).filter(f=>f.endsWith('.html'))){const html=await fs.readFile(root+'/'+file,'utf8');console.log('\nFILE',file);
 if(file.includes('-js')){console.log([...new Set(html.match(/.{0,110}(?:\/[^\s"']*comment[^\s"']*|comments\/|loadComment|load_comment|comment_list|loadmore|load-more|created_at).{0,140}/gi))].slice(0,18));continue;}
 const $=c.load(html); console.log('h1',$('h1').map((i,e)=>$(e).text()).get());
 console.log('meta',$('meta[property*="time"],meta[name*="time"],meta[itemprop*="date"]').map((i,e)=>e.attribs).get());
 console.log('dom',$('[class*="content"],[class*="author"],[class*="time"],[class*="comment"]').map((i,e)=>({tag:e.tagName,id:$(e).attr('id'),class:$(e).attr('class'),text:$(e).text().replace(/\s+/g,' ').slice(0,100)})).get().filter(x=>x.text).slice(-30));
 console.log('state',$('#__NEXT_DATA__').text().slice(0,1400));
 console.log('comment markers',html.match(/.{0,60}(?:data-(?:post|article|id)|comment-list|comments-list|commentCount|totalComment|comment_count).{0,150}/g)?.slice(0,6));
}
