import test from 'node:test';
import assert from 'node:assert/strict';
import {isDeclaredForumHtml,qualifyNewsSourceSamples} from '../src/newsFlow/sourceQualification.mjs';
const samples=()=>[0,1,2].map(i=>({url:'https://news.vn/a'+i,state:'parsed',contentHash:'hash-'+i,description:'Native article summary '+i,independent:i>0}));
test('new sources require a discovery seed, distinct content and two independently fetched holdouts',()=>{
 assert(qualifyNewsSourceSamples(samples(),{listingLinks:10}).approved);
 assert(!qualifyNewsSourceSamples(samples()).approved);
 assert(!qualifyNewsSourceSamples(samples().map(a=>({...a,contentHash:'same'})),{listingLinks:10}).approved);
 assert(!qualifyNewsSourceSamples(samples().map(a=>({...a,independent:false})),{listingLinks:10}).approved);
 assert(!qualifyNewsSourceSamples(samples().map(a=>({...a,description:'Generic site description'})),{listingLinks:10}).approved);
});
test('native forum generators and forum templates are skipped before article parsing',()=>{
 for(const html of ['<meta name="generator" content="XenForo 2.2">','<meta content="MyBB" name="generator">','<html id="XenForo">','<body data-template="forum_list">','<body class="phpbb forum">','<script type="application/ld+json">{"@type":"DiscussionForumPosting"}</script>'])assert(isDeclaredForumHtml(html));
 assert(!isDeclaredForumHtml('<article><h1>A news report about a forum</h1><p>Using XenForo.</p></article>'));
});
