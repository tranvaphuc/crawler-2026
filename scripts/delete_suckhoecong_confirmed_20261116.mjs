import 'dotenv/config';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import ES from 'elasticsearch';
import { Client } from '@opensearch-project/opensearch';

const dir = 'outputs/suckhoecong-delete-20261116';
const expected = {
  ES5: { count: 7978, hash: 'a5bde31cc086a864a57dc9d4abe9d7f69612644d47ed92cb116f28f8841cd365' },
  ES7: { count: 17824, hash: '97c836ba53cf64bb9f0a5a5827a274971ed7bccc2ccc26403bd7b44ce4c06165' },
};
const contexts = [];
const unwrap = r => r.body || r;
const key = r => JSON.stringify([r._index, r._type, r._id]);
const resumeEs7 = process.argv.includes('--resume-es7');
const report = resumeEs7 ? JSON.parse(await fs.readFile(`${dir}/deletion-report.json`, 'utf8')) : { startedAt: new Date().toISOString(), clusters: {} };
if (resumeEs7) { delete report.error; report.resumedAt = new Date().toISOString(); }
async function save() { await fs.writeFile(`${dir}/deletion-report.json`, JSON.stringify(report, null, 2)); }
try {
  // Finish validation and full-source backups for both clusters before any deletion.
  for (const [name, limits] of Object.entries(expected)) {
    if (resumeEs7 && name === 'ES5') continue;
    const raw = await fs.readFile(`${dir}/${name}-manifest.json`, 'utf8');
    if (crypto.createHash('sha256').update(raw).digest('hex') !== limits.hash) throw new Error(`${name}: manifest hash mismatch`);
    const manifest = JSON.parse(raw);
    if (manifest.records.length !== limits.count) throw new Error(`${name}: manifest count mismatch`);
    const es = name === 'ES5'
      ? new ES.Client({ host: process.env.ES5_HOST, apiVersion: '5.6', log: [], requestTimeout: 60000, maxRetries: 0 })
      : new Client({ node: process.env.ES7_HOST, requestTimeout: 60000, maxRetries: 0 });
    const context = { name, es, records: manifest.records, docs: [] };
    contexts.push(context);
    if (resumeEs7) {
      if (report.clusters.ES5.deleted !== 7978) throw new Error('Unexpected resume state');
      const backup = JSON.parse(await fs.readFile(`${dir}/${name}-full-backup.json`, 'utf8'));
      if (backup.docs.length !== limits.count) throw new Error('Backup count mismatch');
      for (let i = 0; i < backup.docs.length; i++) {
        const d = backup.docs[i], r = manifest.records[i];
        if (key(d) !== JSON.stringify([r.index, r.type, r.id]) || d._source.siteName !== 'suckhoecong.vn' || d._source.ds?.source !== 'news-flow-http' || !Number.isInteger(d._seq_no) || !Number.isInteger(d._primary_term)) throw new Error('Backup validation failed');
      }
      context.docs = backup.docs;
      console.log(JSON.stringify({ cluster: name, validatedResumeBackup: backup.docs.length }));
      continue;
    }
    for (let offset = 0; offset < manifest.records.length; offset += 300) {
      const batch = manifest.records.slice(offset, offset + 300);
      const result = unwrap(await es.mget({ body: { docs: batch.map(r => ({ _index: r.index, _type: r.type, _id: r.id })) } }));
      for (let i = 0; i < batch.length; i++) {
        const doc = result.docs[i], wanted = batch[i];
        if (!doc?.found || doc.error || key(doc) !== JSON.stringify([wanted.index, wanted.type, wanted.id])) throw new Error(`${name}: missing or mismatched ID during preflight`);
        if (doc._source.siteName !== 'suckhoecong.vn' || doc._source.ds?.source !== 'news-flow-http') throw new Error(`${name}: source condition changed`);
        if (!Number.isInteger(doc._version)) throw new Error(`${name}: missing version`);
        context.docs.push(doc);
      }
    }
    await fs.writeFile(`${dir}/${name}-full-backup.json`, JSON.stringify({ capturedAt: new Date().toISOString(), docs: context.docs }));
    report.clusters[name] = { approved: limits.count, preflightVerified: context.docs.length, deleted: 0, failed: 0 };
    console.log(JSON.stringify({ cluster: name, preflightVerified: context.docs.length, fullBackupSaved: true }));
  }
  await save();
  for (const { name, es, docs, records } of contexts) {
    const status = report.clusters[name];
    const outcomes = resumeEs7 ? JSON.parse(await fs.readFile(`${dir}/${name}-delete-outcomes.json`, 'utf8').catch(() => '[]')).filter(d => d.status === 200 && d.result === 'deleted') : [];
    const done = new Set(outcomes.map(key));
    status.deleted = done.size;
    status.failed = 0;
    const pending = docs.filter(d => !done.has(key(d)));
    for (let offset = 0; offset < pending.length; offset += 300) {
      let batch = pending.slice(offset, offset + 300);
      if (name === 'ES7') {
        const current = unwrap(await es.mget({ body: { docs: batch.map(d => ({ _index: d._index, _type: d._type, _id: d._id, _source: ['siteName', 'ds.source'] })) } }));
        for (let i = 0; i < batch.length; i++) {
          const d = current.docs[i];
          if (!d?.found || d.error || key(d) !== key(batch[i]) || d._source.siteName !== 'suckhoecong.vn' || d._source.ds?.source !== 'news-flow-http' || !Number.isInteger(d._seq_no) || !Number.isInteger(d._primary_term)) throw new Error('Current ES7 source validation failed');
        }
        batch = current.docs;
      }
      const body = batch.map(d => ({ delete: { _index: d._index, _type: d._type, _id: d._id, ...(name === 'ES5' ? { version: d._version } : { if_seq_no: d._seq_no, if_primary_term: d._primary_term }) } }));
      const result = unwrap(await es.bulk({ body, refresh: true }));
      for (const item of result.items) {
        outcomes.push(item.delete);
        if (item.delete.status === 200 && item.delete.result === 'deleted') status.deleted++;
        else status.failed++;
      }
      await fs.writeFile(`${dir}/${name}-delete-outcomes.json`, JSON.stringify(outcomes));
      await save();
      if (status.failed) throw new Error(`${name}: delete failure; stopped for review`);
    }
    let remaining = 0;
    for (let offset = 0; offset < records.length; offset += 300) {
      const result = unwrap(await es.mget({ body: { docs: records.slice(offset, offset + 300).map(r => ({ _index: r.index, _type: r.type, _id: r.id })) } }));
      for (const doc of result.docs) { if (doc.error) throw new Error(`${name}: verification error`); if (doc.found) remaining++; }
    }
    status.approvedIdsRemaining = remaining;
    const count = unwrap(await es.count({ index: 'master*,topic*', body: { query: { bool: { filter: [{ term: { siteName: 'suckhoecong.vn' } }, { term: { 'ds.source': 'news-flow-http' } }] } } } }));
    if (count._shards?.failed) throw new Error(`${name}: count incomplete`);
    status.currentMatchingCount = count.count;
    if (remaining || status.deleted !== status.approved) throw new Error(`${name}: final count mismatch`);
    console.log(JSON.stringify({ cluster: name, ...status }));
    await save();
  }
  report.completedAt = new Date().toISOString();
  report.success = true;
} catch (error) {
  report.error = String(error.message).replace(/https?:\/\/[^\s]+/g, '[endpoint]');
  process.exitCode = 1;
  console.log(JSON.stringify({ error: report.error }));
} finally {
  await save();
  for (const { es } of contexts) await es.close();
}
