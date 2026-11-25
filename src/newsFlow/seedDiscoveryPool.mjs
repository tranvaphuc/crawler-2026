import {NewsNetworkPool} from './networkPool.mjs';
// Keep a small bounded mailbox on each CPU worker, so a busy main thread cannot
// leave it idle between pages. Each seed worker still processes its pages serially.
export class NewsSeedDiscoveryPool extends NewsNetworkPool{
 constructor({workers=2,maxPerWorker=8,maxQueue=128,...options}={}){super({...options,workers,maxPerWorker,maxQueue,workerUrl:new URL('./seedLinksWorker.mjs',import.meta.url)});}
 run(input){return this.request(input);}
 stats(){return {...super.stats(),mode:'seed_links_workers'};}
}
