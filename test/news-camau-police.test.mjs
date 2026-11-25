import test from 'node:test';import assert from 'node:assert/strict';import {normalizeCamauPoliceArticle} from '../src/web/camauPoliceNews.mjs';
const url='https://congan.camau.gov.vn/ch7/12345-Viet-Nam-hop-tac.html';
const html='<header class="header"><div class="NoidungLeft"><div class="fonttitle">Việt Nam hợp tác</div><div class="fonttime">Cập nhật ngày: 15-11-2026</div><div class="noidung"><p>'+('Native official article paragraph. '.repeat(30))+'</p></div></div></header>';
test('legacy whole-page header is normalized only for an exact owned native article',()=>{const p=normalizeCamauPoliceArticle(html,url);assert(!p.error);assert(p.html.includes('<h1>Việt Nam hợp tác</h1>'));assert(p.html.includes('Cập nhật ngày: 15-11-2026'));assert(p.html.includes('Native official article paragraph.'));assert(normalizeCamauPoliceArticle(html,url.replace('Viet-Nam-hop-tac','Other-article')).error);assert(normalizeCamauPoliceArticle(html.replace('15-11-2026','invalid'),url).error);assert.equal(normalizeCamauPoliceArticle(html,'https://congan.camau.gov.vn/'),null);});

test('native div paragraphs are kept as a real description and punctuation in a full slug is normalized',()=>{
 const div=html.replaceAll('<p>','<div>').replaceAll('</p>','</div>');
 const p=normalizeCamauPoliceArticle(div,url);assert(!p.error);assert(p.html.includes('<div class="article-sapo">Native official article paragraph.'));
 const q=normalizeCamauPoliceArticle(div.replaceAll('Việt Nam hợp tác','Việt Nam IV/2026 hợp tác'),url.replace('Viet-Nam-hop-tac','Viet-Nam-IV2026-hop-tac'));assert(!q.error);
});
