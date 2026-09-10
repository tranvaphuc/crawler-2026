import fs from 'node:fs/promises';
import path from 'node:path';
import { loadMigrationContext, requireSuccess } from './lib/master_migration_lib.mjs';

const outputDir = path.resolve(process.argv[2] || 'outputs/01a07164-8064-7313-962f-0d73887aa809/es5-to-es8');
const compatibility = JSON.parse(await fs.readFile(path.join(outputDir, 'master-ct-es5-compat-v1.proposal.json'), 'utf8'));
const { es8Request } = await loadMigrationContext();
const response = await es8Request('POST', '/_index_template/_simulate', {
  index_patterns: ['es5-stage-*'],
  composed_of: [
    'master-ct-content-settings-v1',
    'master-ct-common-meta-v1',
    'master-ct-content-core-v1',
    'master-ct-content-text-v1',
    'master-ct-intelligence-current-v1',
  ],
  template: compatibility.template,
});
const body = requireSuccess('simulate ES5 compatibility mapping', response);
await fs.writeFile(path.join(outputDir, 'es5-es8-template-simulation.json'), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: 'compatible', dynamic: body.template?.mappings?.dynamic, root_fields: Object.keys(body.template?.mappings?.properties ?? {}).length, deployed: false }, null, 2));
