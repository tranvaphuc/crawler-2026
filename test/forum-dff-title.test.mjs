import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePage} from '../src/forumFlow/adapters.mjs';

const url='https://dff.test/article-p1795060166181.html';
const published='2026-11-19T10:57:16+07:00';
const site={domain:'dff.test',adapter:'dff',allowedHosts:['dff.test']};
const fixture=(articleUrl=url, articleTime=published)=>`
<meta property="og:url" content="${url}">
<meta property="og:title" content="Article headline">
<meta property="article:published_time" content="${published}">
<meta property="article:author" content="Writer">
<script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle',url:articleUrl,datePublished:articleTime,headline:'Article headline'})}</script>
<div class="dcontent">Article body</div>`;

test('DFF recovers a missing visible heading from matching article metadata',()=>{
 assert.equal(parsePage(fixture(),url,site).title,'Article headline');
 assert.equal(parsePage(fixture(url,'2026-11-19T10:55:00+07:00'),url,site).title,'');
 assert.equal(parsePage(fixture('https://dff.test/another-p1795060166182.html'),url,site).title,'');
});
