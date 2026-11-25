import path from 'node:path';
import {createLocalUidAccountUsage} from '../src/services/localUidAccountUsage.js';

const dir=path.resolve(process.env.LOCAL_UID_DIR||'outputs/local-uid-worker-2026-10-29');
const report=createLocalUidAccountUsage({dir}).report();
console.log(JSON.stringify(report,null,2));
