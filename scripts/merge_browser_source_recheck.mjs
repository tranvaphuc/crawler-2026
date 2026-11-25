import fs from 'node:fs/promises';
import {normalizeSource} from './source_audit_normalize.mjs';
const dir = new URL('../outputs/source-audit-2026-10-22/', import.meta.url);
const read = async name => JSON.parse(await fs.readFile(new URL(name, dir), 'utf8'));
const baseline = await read('sources-before-browser-recheck.json');
const queue = await read('browser-recheck-queue.json');
const updates = (await fs.readFile(new URL('browser-recheck.jsonl', dir), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const byKey = new Map();
for (const update of updates) for (const key of update.keys || []) byKey.set(key, {...byKey.get(key), ...update});
const fields = ['name', 'id', 'url', 'type', 'status', 'note', 'identityEvidence', 'checkedAt', 'cid', 'placeId'];
const merged = baseline.map(row => {
  if (row.channel === 'TikTok') return row;
  const update = (row.keys || []).map(key => byKey.get(key)).filter(Boolean).at(-1);
  if (!update) {
    if (row.status !== 'chưa xác định') return row;
    const result = {...row, note:'Chưa kiểm tra lại bằng Chrome đăng nhập | '+(row.note || '')};
    if (row.channel === 'Facebook' && !row.id) {
      try {
        const pair = new URL(row.originalLink).pathname.match(/^\/(\d+)_\d+\/?$/);
        if (pair && row.url && new URL(row.url).pathname.replace(/\/$/,'') === '/'+pair[1]) {
          result.url = '';
          result.note += ' | Chưa xác minh tác giả của link số_số; không dùng số đầu làm source ID.';
        }
      } catch {}
    }
    return result;
  }
  const result = {...row};
  for (const field of fields) if (Object.hasOwn(update, field)) result[field] = update[field];
  result.browserRecheckedAt = update.checkedAt;
  result.browserNameVerified = update.status === 'live' && !!update.name;
  return result;
});
// An unsuccessful browser read must not retain an earlier guessed first-number URL.
for (const row of merged) if (row.channel==='Facebook' && row.status==='chưa xác định' && !row.id && row.url) {
  try {
    const pair=new URL(row.originalLink).pathname.match(/^\/(\d+)_\d+\/?$/);
    if(pair && new URL(row.url).pathname.replace(/\/$/,'')==='/'+pair[1]) {
      row.url='';
      if(!(row.note||'').includes('không dùng số đầu'))row.note=(row.note||'')+' | Chưa xác minh tác giả của link số_số; không dùng số đầu làm source ID.';
    }
  } catch {}
}
const canonical = row => {
  if (!row.url) return '';
  try {
    const u = new URL(row.url);
    return u.hostname.toLowerCase().replace(/^www\./, '') + decodeURI(u.pathname).replace(/\/+$/, '').toLowerCase();
  } catch { return row.url; }
};
// Connect aliases only within the same channel. IDs always remain strings.
const groups = new Map();
const idAtUrl = new Map();
for (const row of merged) if (row.id && row.channel !== 'TikTok') {
  const aliases = [row.url];
  for (const input of row.inputUrls || []) {
    const n = normalizeSource(input, row.channel);
    if (n && !n.unresolved) aliases.push(n.url);
  }
  for (const url of aliases.filter(Boolean)) {
    const key = row.channel + '|' + canonical({url});
    const previous = idAtUrl.get(key);
    idAtUrl.set(key, previous === false || previous && previous !== row.id ? false : row.id);
  }
}
for (const row of merged) {
  const knownId = row.id || idAtUrl.get(row.channel + '|' + canonical(row));
  const identity = knownId ? `id:${knownId}` : canonical(row) ? `url:${canonical(row)}` : `original:${row.originalLink}`;
  const key = row.channel + '|' + identity;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
const score = row => (row.status === 'live' ? 4 : row.status === 'die' ? 1 : 0) + (row.id ? 2 : 0);
const output = [...groups.values()].map(rows => {
  if (rows.length === 1) return rows[0];
  const preferred = [...rows].sort((a,b) => score(b)-score(a))[0];
  const result = {...preferred};
  const latestVerifiedName = rows.filter(r=>r.browserNameVerified).sort((a,b)=>String(b.browserRecheckedAt).localeCompare(String(a.browserRecheckedAt)))[0];
  if (latestVerifiedName) {
    result.name = latestVerifiedName.name;
    result.browserRecheckedAt = latestVerifiedName.browserRecheckedAt;
    result.browserNameVerified = true;
    if (latestVerifiedName.type) result.type = latestVerifiedName.type;
    if (!['Facebook','LinkedIn'].includes(result.channel)) result.url = latestVerifiedName.url || result.url;
  }
  for (const field of ['inputUrls', 'projects', 'keys']) result[field] = [...new Set(rows.flatMap(r => r[field] || []))];
  result.note = [...new Set(rows.map(r => r.note).filter(Boolean))].join(' | ');
  return result;
});
for (const row of output) if (row.id != null && typeof row.id !== 'string') throw new Error('Non-string ID');
const urls = rows => new Set(rows.flatMap(r => r.inputUrls || []));
if (urls(output).size !== urls(baseline).size) throw new Error('Lost input URL aliases');
if (JSON.stringify(output.filter(r=>r.channel==='TikTok')) !== JSON.stringify(baseline.filter(r=>r.channel==='TikTok'))) throw new Error('TikTok changed');
const summary = await read('summary.json');
summary.sourceRows = output.length;
summary.channels = {};
for (const row of output) {
  const s = summary.channels[row.channel] ||= {rows:0,live:0,die:0,unknown:0,withId:0};
  s.rows++; s[row.status==='live'?'live':row.status==='die'?'die':'unknown']++; if(row.id)s.withId++;
}
const visited = queue.filter(row => (row.keys || []).some(key => byKey.has(key)));
summary.browserRecheck = {total:queue.length, checked:visited.length, pending:queue.length-visited.length, excludedChannel:'TikTok', updatedAt:new Date().toISOString(), complete:visited.length===queue.length};
await fs.writeFile(new URL('sources-final.json', dir), JSON.stringify(output, null, 2));
await fs.writeFile(new URL('summary.json', dir), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary.browserRecheck));
