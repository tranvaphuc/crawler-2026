import {test} from 'node:test';
import assert from 'node:assert/strict';
import {observedOriginalParentTarget} from '../scripts/forum_original_parent_canonical_20261119.mjs';
import {legacyForumTopicId} from '../src/web/newsParser.mjs';
const fixture=()=>({site:{domain:'t.test',adapter:'tinhte',allowedHosts:['t.test']},doc:{_id:legacyForumTopicId('https://t.test/thread/a.123'),_source:{url:'https://t.test/thread/a.123'}},observedUrl:'https://t.test/thread/a.123',html:'<link rel="canonical" href="https://t.test/thread/a.123/">'});
test('uses only an observed canonical URL for the same native original',()=>{
 const p=fixture(),target=observedOriginalParentTarget(p);
 assert.equal(target.url,'https://t.test/thread/a.123/');assert.equal(target.id,legacyForumTopicId(target.url));assert.notEqual(target.id,p.doc._id);
});
test('missing or conflicting canonicals never manufacture a new parent ID',()=>{
 for(const html of ['', '<link rel="canonical" href="/thread/a.123/"><link rel="canonical" href="/thread/b.123/">'])assert.throws(()=>observedOriginalParentTarget({...fixture(),html}),/WITHOUT_CANONICAL/);
});
test('rejects a foreign topic, host, credentials, query or fragment',()=>{
 for(const url of ['https://t.test/thread/a.124/','https://x.test/thread/a.123/','https://user:pass@t.test/thread/a.123/','https://t.test/thread/a.123/?x=1','https://t.test/thread/a.123/#x'])assert.throws(()=>observedOriginalParentTarget({...fixture(),html:'<link rel="canonical" href="'+url+'">'}),/IDENTITY_MISMATCH/);
});
test('a canonical that still collides cannot overwrite the historical parent',()=>{
 const p=fixture();p.html='<link rel="canonical" href="'+p.doc._source.url+'">';assert.throws(()=>observedOriginalParentTarget(p),/CANONICAL_ID_COLLISION/);
});
