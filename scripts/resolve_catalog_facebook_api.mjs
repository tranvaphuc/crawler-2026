import 'dotenv/config';
import fs from 'node:fs/promises';
import {setTimeout as wait} from 'node:timers/promises';

const folder = 'outputs/source-keyword-catalog-2026-11-19/cross-platform-audit/active-facebook-chrome-recheck';
const targets = JSON.parse(await fs.readFile(folder + '/api-resolve-targets.json', 'utf8'));
const filename = folder + '/api-resolve-results.jsonl';
const seen = new Set((await fs.readFile(filename, 'utf8').catch(e => {
  if (e.code !== 'ENOENT') throw e;
  return '';
})).split('\n').filter(Boolean).map(line => {
  const previous = JSON.parse(line);
  return previous.source_key + '\t' + previous.target;
}));
const domain = process.env.DOMAIN_FOR_API;
const secret = process.env.AUTHEN_KEY_FOR_DOMAIN;
if (!domain || !secret) throw Error('CRAWLER_API_CONFIG_REQUIRED');
const endpoint = new URL('/api/social/resource/resolve', domain.includes('://') ? domain : 'https://' + domain);
if (endpoint.protocol !== 'https:') throw Error('CRAWLER_API_HTTPS_REQUIRED');

const counts = {};
const available = targets.filter(target => !seen.has(target.source_key + '\t' + target.visit));
const journal = await fs.open(filename, 'a');
try {
  for (const target of available) {
    let row = {source_key:target.source_key, target:target.visit, checked_at:new Date().toISOString()};
    try {
      const response = await fetch(endpoint, {
        method:'POST', redirect:'error', signal:AbortSignal.timeout(23000),
        headers:{authorization:'Bearer ' + secret, 'content-type':'application/json'},
        body: JSON.stringify({url:target.visit, kind:'source', platform:'facebook'})
      });
      const data = await response.json();
      const approved = {
        page: ['matched_profile.delegate_page.id', 'matched_Page.id'],
        user: ['matched_User.explicit_personal_profile', 'matched_User.id']
      };
      const verified = response.ok && data.status === 'resolved' && data.idVerified === true &&
        typeof data.id === 'string' && /^\d{5,25}$/.test(data.id) && approved[data.type]?.includes(data.evidence);
      row = {...row, http:response.status, status:data.status || 'HTTP_ERROR',
        reason: typeof data.reason === 'string' && /^[A-Z0-9_]{3,100}$/.test(data.reason) ? data.reason : null,
        ...(verified ? {id:data.id,type:data.type,evidence:data.evidence,name:String(data.name || '').slice(0,180)} : {})};
    } catch (err) {
      row.status = err.name === 'TimeoutError' ? 'TIMEOUT' : 'READ_ERROR';
    }
    await journal.appendFile(JSON.stringify(row) + '\n');
    counts[row.id ? 'VERIFIED_' + row.type : row.status] = (counts[row.id ? 'VERIFIED_' + row.type : row.status] || 0) + 1;
    if ([401,403,429].includes(row.http) || ['security_checkpoint','rate_limited','auth_required'].includes(row.status)) break;
    if ((counts.READ_ERROR || 0) + (counts.TIMEOUT || 0) >= 5 && !(counts.VERIFIED_page || counts.VERIFIED_user)) break;
    await wait(900);
  }
} finally {
  await journal.close();
  console.log(JSON.stringify({targets:targets.length,previous:seen.size,counts}));
}
