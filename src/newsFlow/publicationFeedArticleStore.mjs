import {gzipSync,gunzipSync} from 'node:zlib';
import {wordpressFullRssEntries} from '../web/wordpressFullRss.mjs';
import {requestKey,articleKey} from './identity.mjs';
export function initializePublicationFeedArticleStore(db){db.exec('CREATE TABLE IF NOT EXISTS publication_feed_articles(feed TEXT NOT NULL,url TEXT NOT NULL,xml BLOB NOT NULL,source_sha TEXT NOT NULL,checked_at INTEGER NOT NULL,PRIMARY KEY(feed,url));');}
export function prepareFullPublicationFeed({xml,feedUrl}){return wordpressFullRssEntries(xml,feedUrl).map(r=>[requestKey(feedUrl),articleKey(r.url),gzipSync(r.xml),r.sourceFeedSha256,Date.now()]);}
export function storeFullPublicationFeed(db,rows){
 const insert=db.prepare('INSERT OR IGNORE INTO publication_feed_articles VALUES(?,?,?,?,?)');let saved=0;
 for(const r of rows)saved+=insert.run(...r).changes;
 return saved;
}
export function rememberFullPublicationFeed(db,context){return storeFullPublicationFeed(db,prepareFullPublicationFeed(context));}
export function recalledPublicationArticle(db,feed,url){
 const r=db.prepare('SELECT xml,source_sha FROM publication_feed_articles WHERE feed=? AND url=?').get(requestKey(feed),articleKey(url));
 return r?{xml:gunzipSync(r.xml).toString(),sourceFeedSha256:r.source_sha}:null;
}
