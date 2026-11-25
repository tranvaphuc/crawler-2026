import fs from 'node:fs/promises';import * as c from 'cheerio';
const root='outputs/forum-activity-2026-11-17';
for(const d of ['bovagau.vn','dff.vn','offb.vn','pantip.com','phunuvietkhoinghiep.vn','tctd.vn','vietnambusinessinsider.vn','tinhte.vn']){
 const html=await fs.readFile(`${root}/${d}-home.html`,'utf8');const $=c.load(html);console.log('\nDOMAIN',d);
 console.log('scripts',$('script[src]').map((i,e)=>$(e).attr('src')).get().slice(-10));
 console.log('state',$('script#__NEXT_DATA__,script[type="application/ld+json"]').map((i,e)=>$(e).text().slice(0,400)).get().slice(0,2));
 const time=$('time,[datetime],.DateTime,[data-time]').first();console.log('time-parent',time.parent().parent().prop('outerHTML')?.slice(0,1800));
 console.log('postlinks',$('a[href]').map((i,e)=>({url:$(e).attr('href'),text:$(e).text().trim().slice(0,75)})).get().filter(x=>/\d{3}|post|detail/.test(x.url)&&x.text.length>15).slice(0,6));
 console.log('relative',html.match(/.{0,150}(?:13 phút trước|1 giờ trước|17 พฤศจิกายน 2569|13\/11\/2026|13:59 10\/11).{0,180}/g)?.slice(0,2));
}
