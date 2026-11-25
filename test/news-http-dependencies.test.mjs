import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {NewsHttpDriver} from '../src/newsFlow/transport.mjs';
import {arttimesDeclaredArticleFrame} from '../src/web/publicArticleBodies.mjs';

test('declared publisher body dependency is reachable without becoming an article source', async () => {
  const registry = await loadNewsRegistry();
  const driver = new NewsHttpDriver({state: {}, pool: {}, allowedDomains: registry.allowedDomains});
  assert.equal(driver.validate('https://at1.click.vn/noi-dung-bai-viet-nId123.html').hostname, 'at1.click.vn');
  assert.equal(registry.byHost('at1.click.vn'), undefined);
  assert.throws(() => driver.validate('https://unconfigured.invalid/article'), /UNCONFIGURED_TARGET_HOST/);
  const url = 'https://arttimes.vn/van-tho/native-c55a123.html';
  const page = host => `<link rel="canonical" href="${url}"><script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle',url,headline:'Native article',datePublished:'2026-11-15T10:00:00+07:00'})}</script><iframe id="ifrm_news_special" src="https://${host}/noi-dung-bai-viet-nId123.html"></iframe>`;
  assert.equal(arttimesDeclaredArticleFrame(page('at1.click.vn'), url)?.url, 'https://at1.click.vn/noi-dung-bai-viet-nId123.html');
  assert.equal(arttimesDeclaredArticleFrame(page('unconfigured.invalid'), url), null);
});
