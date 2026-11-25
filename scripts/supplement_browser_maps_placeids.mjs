import fs from 'node:fs/promises';
import {decode} from './source_audit_metadata.mjs';
const dir = new URL('../outputs/source-audit-2026-10-22/', import.meta.url);
const log = new URL('browser-recheck.jsonl', dir);
const updates = (await fs.readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const latest = new Map();
for (const u of updates) if (u.channel === 'GG Reviews') latest.set(u.index, {...latest.get(u.index), ...u});
const queue = [...latest.values()].filter(u => u.status === 'live' && u.cid && !u.placeId);
let cursor = 0;
async function page(url) {
  const r = await fetch(url, {signal: AbortSignal.timeout(10000), headers: {'User-Agent':'Mozilla/5.0', 'Accept-Language':'en'}});
  if (!r.ok) throw new Error('HTTP_' + r.status);
  return await r.text();
}
async function worker() {
  while (cursor < queue.length) {
    const u = queue[cursor++];
    try {
      const body = await page('https://www.google.com/maps?cid=' + u.cid + '&hl=en');
      const href = body.match(/<link\b[^>]*href="([^"<]*\/maps\/preview\/place\?[^"<]*)"/i)?.[1];
      if (!href) throw new Error('NO_PLACE_PREVIEW');
      const preview = await page(new URL(decode(href), 'https://www.google.com').href);
      const place = JSON.parse(preview.replace(/^\)\]\}'\s*/, ''))?.[6];
      const feature = typeof place?.[10] === 'string' && place[10].match(/^0x[\da-f]+:(0x[\da-f]+)$/i);
      if (!feature || BigInt(feature[1]).toString() !== u.cid) throw new Error('CID_MISMATCH');
      if (typeof place[78] !== 'string' || !/^[\w-]{15,200}$/.test(place[78])) throw new Error('NO_PLACE_ID');
      await fs.appendFile(log, JSON.stringify({...u, placeId:place[78], name:place[11] || u.name, note:u.note.replace('chưa lấy được Place ID.', 'đã đối chiếu Place ID theo CID.'), identityEvidence:u.identityEvidence + '; official Maps preview CID/name/Place ID', checkedAt:new Date().toISOString()}) + '\n');
      console.log(JSON.stringify({index:u.index, cid:u.cid, placeId:place[78], status:'VERIFIED'}));
    } catch (e) {
      console.log(JSON.stringify({index:u.index, status:'UNCHANGED', reason:e.name === 'TimeoutError' ? 'TIMEOUT' : e.message}));
    }
  }
}
await Promise.all([worker(), worker(), worker()]);
