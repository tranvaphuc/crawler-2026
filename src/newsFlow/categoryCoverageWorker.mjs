import {parentPort} from 'node:worker_threads';
import {inspectCategoryPage} from './categoryCoverage.mjs';
parentPort.on('message',input=>{try{parentPort.postMessage(inspectCategoryPage(input));}catch(e){parentPort.postMessage({error:/^[A-Za-z0-9_]+$/.test(e.code||'')?e.code:'CATEGORY_INSPECTION_FAILED',articles:[],categories:[]});}});
