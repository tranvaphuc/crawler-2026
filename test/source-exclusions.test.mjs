import {isExcludedSource} from '../src/web/sourceExclusions.mjs';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {NewsHttpDriver} from '../src/newsFlow/transport.mjs';
import {safeUrl} from '../src/forumFlow/adapters.mjs';
import {ForumRuntime} from '../src/forumFlow/runtime.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('FireAnt stays excluded when reintroduced under a different source name', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'news-exclusions-'));
  try {
    const source = {domain: 'example.com', homepage: 'https://example.com/', allowedHosts: ['example.com']};
    const blocked = {...source, discovery: {categories: ['https://f.fireant.vn/posts']}};
    await fs.writeFile(path.join(directory, 'example.com.json'), JSON.stringify(source));
    await fs.writeFile(path.join(directory, 'alias.example.json'), JSON.stringify(blocked));
    const registry = await loadNewsRegistry({directory});
    assert.deepEqual([...registry.sources.keys()], ['example.com']);
    const forum = new ForumRuntime({state: {setSince() {}}, sites: [source, {...source, seeds: blocked.discovery.categories}], transport: {}});
    assert.deepEqual(forum.sites, [source]);
  } finally {
    await fs.rm(directory, {recursive: true, force: true});
  }
});

test('FireAnt host and subdomains are blocked before HTTP even when allowlisted', () => {
  const hosts = ['fireant.vn', 'news.fireant.vn', 'fireant.vn.'];
  const driver = new NewsHttpDriver({allowedDomains: hosts});
  for (const host of hosts) {
    const url = 'https://' + host + '/article';
    assert.throws(() => driver.validate(url), {code: 'NEWS_UNCONFIGURED_TARGET_HOST'});
    assert.equal(safeUrl(url, url, {allowedHosts: hosts}), null);
  }
  assert.equal(isExcludedSource('https://notfireant.vn'), false);
});
