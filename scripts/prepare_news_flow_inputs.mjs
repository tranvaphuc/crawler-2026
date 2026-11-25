import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Offline preparation only: never import a crawler, create a queue or mutate configs.
const root = path.resolve('outputs/news-flow-preparation-2026-11-12');
const configRoot = path.resolve('config/web-sources/news');
const names = (await fs.readdir(configRoot)).filter(f => f.endsWith('.json') && !f.endsWith('.validated.json')).sort();
const rows = [];
const localEvidence = value => {
  if (!value) return null;
  const normalized = value.replaceAll('\\', '/');
  const offset = normalized.indexOf('/outputs/');
  return offset >= 0 ? normalized.slice(offset + 1) : normalized;
};
for (const name of names) {
  const preferred = name === 'antt.vn.json' ? 'antt.vn.validated.json' : name;
  const configFile = path.join(configRoot, preferred);
  const c = JSON.parse(await fs.readFile(configFile, 'utf8'));
  const v = c.parserRepairValidation || {};
  const homepage = c.discovery?.homepage || c.homepage || null;
  const categories = [...new Set(c.discovery?.categories || [])];
  const seeds = [...new Set([homepage, ...categories].filter(Boolean))];
  const resultFile = localEvidence(v.resultFile);
  const evidenceExists = resultFile ? await fs.access(resultFile).then(() => true, () => false) : false;
  rows.push({
    domain: name.slice(0, -5), configFile: path.relative(process.cwd(), configFile).replaceAll('\\', '/'),
    enabled: c.enabled === true, homepage, categoryCandidates: categories,
    seedCandidates: seeds, seedReviewRequired: true,
    allowedHosts: c.allowedHosts || [], sourceAlias: c.sourceAlias || null,
    historicalStatus: v.status || 'unconfirmed', checkedAt: v.checkedAt || null,
    historicalStage: v.stage || null, resultFile, evidenceExists,
    parserModule: c.parserModule || null, parserType: c.parserType || null,
    title: c.title || null, body: c.body || null, publishedDate: c.publishedDate || null,
    description: c.description || c.selectors?.description || null,
    descriptionVerification: 'not_verified_by_this_preparation',
    requiresPublicationContext: c.requiresPublicationContext === true,
    timezoneReviewRequired: c.requiresTimezoneReviewBeforeWrite === true,
    issueCounts: v.issueCounts || {},
    sampleUrls: [...new Set(c.validation?.sampleUrls || [])],
    releaseReady: false,
  });
}
assert.equal(rows.length, 544);
assert.equal(new Set(rows.map(r => r.domain)).size, 544);
const statuses = rows.reduce((o,r) => (o[r.historicalStatus] = (o[r.historicalStatus] || 0) + 1, o), {});
const summary = {
  preparedAt: new Date().toISOString(), offlineOnly: true, sites: rows.length,
  historicalStatuses: statuses,
  configuredCategoryCandidates: rows.reduce((n,r) => n + r.categoryCandidates.length, 0),
  seedCandidatesWithinSites: rows.reduce((n,r) => n + r.seedCandidates.length, 0),
  globallyUniqueSeedCandidates: new Set(rows.flatMap(r => r.seedCandidates)).size,
  sitesWithoutCategoryCandidates: rows.filter(r => !r.categoryCandidates.length).map(r => r.domain),
  missingEvidenceFiles: rows.filter(r => !r.evidenceExists).map(r => r.domain),
  explicitDescriptionConfigs: rows.filter(r => r.description).length,
  publicationContextSites: rows.filter(r => r.requiresPublicationContext).map(r => r.domain),
  runtimeBuilt: false, liveRetestPerformed: false, releaseReadySites: 0,
};
await fs.mkdir(root, {recursive:true});
await fs.writeFile(path.join(root, 'inventory.json'), JSON.stringify({summary, sites:rows}, null, 2));
await fs.writeFile(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2));
const clean = v => String(v ?? '').replace(/[\t\r\n]+/g,' ');
await fs.writeFile(path.join(root, 'sites.tsv'), [
  ['domain','historical_status','checked_at','homepage','category_candidates','seed_candidates','evidence','evidence_exists','description_verified'],
  ...rows.map(r => [r.domain,r.historicalStatus,r.checkedAt,r.homepage,r.categoryCandidates.length,r.seedCandidates.length,r.resultFile,r.evidenceExists,false]),
].map(r => r.map(clean).join('\t')).join('\n')+'\n');
await fs.writeFile(path.join(root, 'seed-candidates.tsv'), [
  'domain\tkind\turl\tstatus',
  ...rows.flatMap(r => r.seedCandidates.map(url => [r.domain,url === r.homepage ? 'homepage' : 'category',url,'needs_review'].map(clean).join('\t'))),
].join('\n')+'\n');
console.log(JSON.stringify(summary, null, 2));
