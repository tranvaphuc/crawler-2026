import { createEs9Request, deployMasterTemplateEs9, loadProjectEnv } from './lib/es9_master_target.mjs';

const env = await loadProjectEnv();
const result = await deployMasterTemplateEs9({ env, es9Request: createEs9Request(env) });
process.stdout.write(`${JSON.stringify({ event: 'es9_master_template_deployed', ...result })}\n`);
