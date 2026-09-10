import fs from 'node:fs/promises';
import path from 'node:path';
import { deepClone } from './lib/node_compat.mjs';

const [mappingPath, settingsPath, outputPath] = process.argv.slice(2);
if (!mappingPath || !settingsPath || !outputPath) {
  throw new Error('Usage: node scripts/build_es8_mapping_proposal.mjs <mapping> <settings> <output>');
}

const mapping = JSON.parse(await fs.readFile(mappingPath, 'utf8'));
const sourceSettings = JSON.parse(await fs.readFile(settingsPath, 'utf8')).index ?? {};

let normalizedDateFields = 0;
const normalizeFieldMappings = (properties = {}) => {
  for (const field of Object.values(properties)) {
    if (field.type === 'date' && !field.format) {
      field.format = 'strict_date_optional_time||epoch_millis';
      normalizedDateFields += 1;
    }
    normalizeFieldMappings(field.properties);
    normalizeFieldMappings(field.fields);
  }
};
normalizeFieldMappings(mapping.properties);

const analysis = deepClone(sourceSettings.analysis ?? {});
const phoneAnalyzer = analysis?.analyzer?.phone_number;
if (phoneAnalyzer && typeof phoneAnalyzer.char_filter === 'string') {
  phoneAnalyzer.char_filter = [phoneAnalyzer.char_filter];
}

const proposal = {
  settings: {
    number_of_shards: Number(sourceSettings.number_of_shards ?? 1),
    number_of_replicas: Number(sourceSettings.number_of_replicas ?? 0),
    refresh_interval: sourceSettings.refresh_interval ?? '30s',
    analysis,
  },
  mappings: {
    ...mapping,
    _meta: {
      ...(mapping._meta ?? {}),
      source_index: 'topic56fc9bc282ea19d067e5d8a1',
      source_mapping_version: 'ES7/OpenSearch-compatible',
      target_mapping_version: 'Elasticsearch 8 typeless',
    },
  },
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(proposal, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  topLevelFieldCount: Object.keys(proposal.mappings.properties ?? {}).length,
  dynamic: proposal.mappings.dynamic,
  analyzers: Object.keys(proposal.settings.analysis?.analyzer ?? {}),
  normalizedDateFields,
}, null, 2));
