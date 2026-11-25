import {parentPort} from 'node:worker_threads';import {requestNewsHttp} from './httpRequest.mjs';
parentPort.on('message',async({id,input})=>{
 try{const r=await requestNewsHttp(input);if(r.data){const data=Uint8Array.from(r.data).buffer;parentPort.postMessage({id,...r,data},[data]);}else parentPort.postMessage({id,...r});}
 catch{parentPort.postMessage({id,error:'NEWS_NETWORK_REQUEST_FAILED',connectStatus:null,networkElapsedMs:0,completedAt:Date.now()});}
});
