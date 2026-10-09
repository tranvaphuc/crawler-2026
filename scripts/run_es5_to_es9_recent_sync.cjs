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

const intervalMs = Math.max(10_000, Number(process.env.ES5_TO_ES9_RECENT_INTERVAL_MS || 300_000));
let child;
let timer;
let stopping = false;
let cycle = 0;

function runCycle() {
  cycle += 1;
  console.log(`[ES5-TO-ES9][RECENT RUNNER 05] starting cycle=${cycle}`);
  child = spawn(process.execPath, [syncScript, ...syncArgs], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });
  console.log(`[ES5-TO-ES9][RECENT RUNNER 06] child spawned pid=${child.pid ?? 'pending'} cycle=${cycle}`);
  child.on('error', (error) => {
    console.error(`[ES5-TO-ES9][RECENT RUNNER ERROR] cycle=${cycle} ${error.stack || error}`);
  });
  child.on('exit', (code, signal) => {
    console.log(`[ES5-TO-ES9][RECENT RUNNER EXIT] cycle=${cycle} child code=${code} signal=${signal ?? 'none'}`);
    child = undefined;
    if (stopping) return process.exit(code ?? 0);
    console.log(`[ES5-TO-ES9][RECENT RUNNER WAIT] next cycle in ${intervalMs}ms`);
    timer = setTimeout(runCycle, intervalMs);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    if (timer) clearTimeout(timer);
    console.log(`[ES5-TO-ES9][RECENT RUNNER SIGNAL] forwarding ${signal} to child pid=${child?.pid ?? 'none'}`);
    if (child?.pid) child.kill(signal);
    else process.exit(0);
  });
}

runCycle();
