import {AsyncLocalStorage} from 'node:async_hooks';

const queues=new AsyncLocalStorage();
export const validProxyQueue=queue=>typeof queue==='string'&&/^crawler-flow-(facebook-(page-source|group-source|user-source|comment|reply)|(?:instagram|youtube|threads)-(source|comment)|find-uid|es5-import)$/.test(queue);
export const crawlerQueue=()=>queues.getStore();
export function runCrawlerQueue(queue,work){
 if(!validProxyQueue(queue))throw Object.assign(Error('PROXY_QUEUE_INVALID'),{code:'PROXY_QUEUE_INVALID'});
 return queues.run(queue,work);
}
