import {parsePublishedDate} from '../web/configurableNewsParser.mjs';
import {articleKey,requestKey} from './identity.mjs';

// News feeds roll over before the article queue necessarily reaches their links.
// Retain original publisher clocks, including conflicts, rather than inventing a date.
export function initializePublicationFeedStore(db){db.exec(`CREATE TABLE IF NOT EXISTS publication_feed_dates(feed TEXT NOT NULL,url TEXT NOT NULL,iso TEXT NOT NULL,raw TEXT NOT NULL,checked_at TEXT NOT NULL,PRIMARY KEY(feed,url,iso));`);}
export function rememberPublicationFeed(db,context){
 const feed=new URL(context.feedUrl),insert=db.prepare('INSERT OR IGNORE INTO publication_feed_dates VALUES(?,?,?,?,?)');
 let saved=0;
 for(const item of context.items||[]){
  try{const url=new URL(item.url),date=parsePublishedDate(item.raw,null);
   if(!/^https?:$/.test(url.protocol)||url.username||url.password||url.hostname.replace(/^www\./,'')!==feed.hostname.replace(/^www\./,'')||!/(?:Z|GMT|[+-]\d{2}:?\d{2})$/i.test(item.raw)||!date||date.iso!==item.iso||!['minute','second'].includes(date.precision))continue;
   saved+=insert.run(requestKey(feed.href),articleKey(url.href),item.iso,item.raw,context.checkedAt||new Date().toISOString()).changes;
  }catch{}
 }
 return saved;
}
export function recalledPublicationFeed(db,feedUrl,articleUrl){
 const rows=articleUrl?db.prepare('SELECT url,iso,raw,checked_at FROM publication_feed_dates WHERE feed=? AND url=?').all(requestKey(feedUrl),articleKey(articleUrl)):db.prepare('SELECT url,iso,raw,checked_at FROM publication_feed_dates WHERE feed=?').all(requestKey(feedUrl)),publicationDates={};
 for(const row of rows){const prior=publicationDates[row.url];publicationDates[row.url]=prior&&prior.iso!==row.iso?{iso:null,raw:null,conflict:true}:prior||{iso:row.iso,raw:row.raw};}
 return {schemaVersion:1,feedUrl,checkedAt:rows.map(r=>r.checked_at).sort().at(-1),publicationDates,items:rows.map(({url,iso,raw})=>({url,iso,raw}))};
}
