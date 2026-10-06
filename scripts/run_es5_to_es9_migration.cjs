const { spawn } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const migrationScript = path.join(__dirname, 'migrate_es5_oct2026_to_es9.mjs');
const migrationArgs = process.argv.slice(2);

console.log(`[ES5-TO-ES9][RUNNER 00] runner started pid=${process.pid}`);
console.log(`[ES5-TO-ES9][RUNNER 01] node=${process.execPath} version=${process.version}`);
console.log(`[ES5-TO-ES9][RUNNER 02] cwd=${projectRoot}`);
console.log(`[ES5-TO-ES9][RUNNER 03] script=${migrationScript}`);
console.log(`[ES5-TO-ES9][RUNNER 04] args=${JSON.stringify(migrationArgs)}`);

const child = spawn(process.execPath, [migrationScript, ...migrationArgs], {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

console.log(`[ES5-TO-ES9][RUNNER 05] child spawned pid=${child.pid ?? 'pending'}`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[ES5-TO-ES9][RUNNER SIGNAL] forwarding ${signal} to child pid=${child.pid ?? 'unknown'}`);
    if (child.pid) child.kill(signal);
  });
}

child.on('error', (error) => {
  console.error(`[ES5-TO-ES9][RUNNER ERROR] ${error.stack || error}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  console.log(`[ES5-TO-ES9][RUNNER EXIT] child code=${code} signal=${signal ?? 'none'}`);
  process.exit(code ?? 1);
});
