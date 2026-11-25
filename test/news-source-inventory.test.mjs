import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyNewsSourceHit,newsSourceHost} from '../src/newsFlow/sourceInventory.mjs';
const source={domain:'publisher.vn',config:{registrableDomain:'publisher.vn'}};
const registry={sources:new Map([[source.domain,source]]),byHost:h=>h==='publisher.vn'?source:null};
const hit=(url,siteName='other.vn',type='newsTopic')=>({_type:type,_source:{url,siteName}});
test('forum and fireant exclusions apply before deciding whether a site needs HTTP checking',()=>{
 for(const url of ['https://fireant.vn/post/1','https://f.fireant.vn/post/2'])assert.equal(classifyNewsSourceHit(hit(url),registry).reason,'user_excluded_fireant');
 assert.equal(classifyNewsSourceHit(hit('https://f319.com/thread/1'),registry,new Set(['f319.com'])).reason,'user_excluded_forum');
 assert.equal(classifyNewsSourceHit(hit('https://new.vn/a','new.vn','forumTopic'),registry).reason,'user_excluded_forum');
 assert.equal(classifyNewsSourceHit(hit('https://forum.new.vn/a'),registry).reason,'user_excluded_forum');
});
test('actual URL host discovers missing publishers despite misleading siteName labels',()=>{
 const row=classifyNewsSourceHit(hit('https://new.vn/news/a','publisher.vn'),registry);
 assert.equal(row.state,'candidate');assert.equal(row.domain,'new.vn');
 assert.equal(classifyNewsSourceHit(hit('https://m.publisher.vn/a'),registry).source,'publisher.vn');
});
test('non-host labels, credentials and IP addresses do not become source configurations',()=>{
 for(const value of ['Not a hostname','https://u:p@publisher.vn/','https://127.0.0.1/'])assert.equal(newsSourceHost(value),null);
 assert.equal(newsSourceHost('WWW.PUBLISHER.VN'),'publisher.vn');
});
