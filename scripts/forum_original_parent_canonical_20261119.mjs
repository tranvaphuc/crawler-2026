import * as cheerio from 'cheerio';
import {forumIdentity} from '../src/forumFlow/es5.mjs';
import {legacyForumTopicId} from '../src/web/newsParser.mjs';

export function observedOriginalParentTarget({doc,site,html,observedUrl}){
 const $=cheerio.load(html),values=[...new Set($('link[rel="canonical"]').toArray().map(el=>$(el).attr('href')).filter(Boolean).map(value=>new URL(value,observedUrl).href))];
 if(values.length!==1)throw Error('ORIGINAL_ID_COLLISION_WITHOUT_CANONICAL');
 const url=new URL(values[0]),identity=forumIdentity(doc._source.url,'forumTopic',site);
 if(!/^https?:$/.test(url.protocol)||url.username||url.password||url.hash||url.search||!identity?.startsWith('topic:')||forumIdentity(url.href,'forumTopic',site)!==identity)throw Error('CANONICAL_NATIVE_IDENTITY_MISMATCH');
 const id=legacyForumTopicId(url.href);
 if(id===doc._id)throw Error('ORIGINAL_CANONICAL_ID_COLLISION');
 return {url:url.href,id};
}
