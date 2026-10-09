const { spawn } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const syncScript = path.join(__dirname, 'sync_es5_recent_to_es9.mjs');
const syncArgs = process.argv.slice(2);

console.log(`[ES5-TO-ES9][RECENT RUNNER 00] runner started pid=${process.pid}`);
console.log(`[ES5-TO-ES9][RECENT RUNNER 01] node=${process.execPath} version=${process.version}`);
console.log(`[ES5-TO-ES9][RECENT RUNNER 02] cwd=${projectRoot}`);
console.log(`[ES5-TO-ES9][RECENT RUNNER 03] script=${syncScript}`);
console.log(`[ES5-TO-ES9][RECENT RUNNER 04] args=${JSON.stringify(syncArgs)}`);

const child = spawn(process.execPath, [syncScript, ...syncArgs], {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

console.log(`[ES5-TO-ES9][RECENT RUNNER 05] child spawned pid=${child.pid ?? 'pending'}`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[ES5-TO-ES9][RECENT RUNNER SIGNAL] forwarding ${signal} to child pid=${child.pid ?? 'unknown'}`);
    if (child.pid) child.kill(signal);
  });
}

child.on('error', (error) => {
  console.error(`[ES5-TO-ES9][RECENT RUNNER ERROR] ${error.stack || error}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  console.log(`[ES5-TO-ES9][RECENT RUNNER EXIT] child code=${code} signal=${signal ?? 'none'}`);
  process.exit(code ?? 1);
});
