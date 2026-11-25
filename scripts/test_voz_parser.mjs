// Backward-compatible entry point; all fetching is HTTP only.
if(!process.argv.includes('--domains'))process.argv.push('--domains','voz.vn');
await import('./test_voz_tinhte_parsers.mjs');
