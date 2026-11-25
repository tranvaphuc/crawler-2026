import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {gzip} from 'node:zlib';import {promisify} from 'node:util';
import {createResearchTransport} from '../web/researchTransport.mjs';
import {discover,parsePage,safeUrl,topicUrl,nativeThreadId} from './adapters.mjs';
import {collectComments} from './comments.mjs';
import {isExcludedSource} from '../web/sourceExclusions.mjs';
export class ForumRuntime{
 constructor({state,sites,evidenceDirectory='outputs/forum-flow/evidence',since='2026-10-01T00:00:00+07:00',transport,maxTopicsPerSite=50,maxCatchupTopicsPerSite,maxSeedPages,maxThreadPages,onEvent=()=>{}}){sites=sites.filter(site=>![site.domain,site.homepage,...site.allowedHosts||[],...site.seeds||[]].some(isExcludedSource));Object.assign(this,{state,sites,evidenceDirectory,maxTopicsPerSite,maxCatchupTopicsPerSite,maxSeedPages,maxThreadPages,onEvent});this.since=Date.parse(since);if(!Number.isFinite(this.since)||!/(Z|[+-]\d\d:\d\d)$/.test(since))throw Error('SINCE_REQUIRES_EXPLICIT_TIMEZONE');state.setSince(this.since);this.transport=transport||createResearchTransport({timeoutMs:15000,maxSockets:4,persistEvidence:false,onNetworkRequest:({url})=>{if(isExcludedSource(url))throw Error('REQUEST_HOST_NOT_ALLOWED');}});this.owner=null;this.stopped=false;}
 event(site,url,kind,details){this.state.event(site.domain,url,kind,details);this.onEvent({site:site.domain,url,kind,...details});}
 async fetch(site,url){if(!safeUrl(url,site.homepage,site))throw Error('REQUEST_HOST_NOT_ALLOWED');const key=createHash('sha256').update(url).digest('hex');const dir=path.resolve(this.evidenceDirectory,site.domain);const r=await this.transport.get(url,dir,key);if(r.error)throw Error('DOWNLOAD_'+r.error);if(!safeUrl(r.finalUrl||url,url,site))throw Error('REDIRECT_HOST_NOT_ALLOWED');if(!r.html)throw Error('EMPTY_RESPONSE');const hash=createHash('sha256').update(r.html).digest('hex'),file=path.join(dir,hash+'.html.gz');await fs.mkdir(dir,{recursive:true});try{await fs.writeFile(file,await promisify(gzip)(r.html),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}return {...r,finalUrl:r.finalUrl||url,contentHash:hash,evidenceFile:file};}
 metadata(r){const {html,...meta}=r;return meta;}
 async seeds(site){
  const seeds=[...new Set([...site.seeds,site.homepage])];
  for(const seed of seeds){if(this.stopped||!this.state.seedDue(site.domain,seed))continue;let url=seed,count=0;const seen=new Set();const cap=this.maxSeedPages??site.maxSeedPages;
   try{while(url&&!seen.has(url)&&count<cap){seen.add(url);const r=await this.fetch(site,url);const found=discover(r.html,r.finalUrl,site);for(const u of found.urls){let id=nativeThreadId(u);if(site.adapter==='wordpress')id='url:'+createHash('sha256').update(u).digest('hex');this.state.enqueue(site.domain,u,id);}count++;this.event(site,url,'seed_page',{urls:found.urls.length,evidence:r.evidenceFile});url=found.next.find(u=>!seen.has(u))||null;}
    this.state.seedResult(site.domain,seed,url?'partial':'verified',url?'seed_page_limit_reached':null,site.pollSeconds*1000);
   }catch(e){this.state.seedResult(site.domain,seed,'failed',e.message,Math.max(60000,site.pollSeconds*1000));this.event(site,seed,'seed_failed',{reason:e.message});}
  }
 }
 async topic(site,row){
  let resume=row.resume_url,visited=new Set(),count=0;
  const cap=this.maxThreadPages??site.maxThreadPagesPerRun;
  try{
   const first=await this.fetch(site,row.url),root=parsePage(first.html,first.finalUrl,site);
   if(!root.complete)throw Error('ROOT_PARSE_'+(root.rejected.map(x=>x.reason||x.missing?.join(',')).join(';')||'required_fields_missing'));
   if(!root.posts.some(p=>p.role==='forumTopic'))throw Error('ORIGINAL_TOPIC_NOT_FOUND');
   if(site.adapter==='xenforo'&&(!root.nativeThreadId||String(root.nativeThreadId)!==String(row.native_id)))throw Error('ROOT_THREAD_IDENTITY_UNCONFIRMED');
   this.state.savePage(site,root,this.metadata(first),{since:this.since});count++;
   this.event(site,row.url,'topic_page',{posts:root.posts.length,coverage:root.coverage,evidence:first.evidenceFile});
   if(site.adapter!=='xenforo'){
    // Site adapters must prove the comment cursor before this URL is complete.
    // Topic data is retained even when the public comment endpoint is unavailable.
    let comments;
    if(site.adapter==='tinhte'){
     const ids=new Set(root.posts.map(p=>p.nativePostId));let next=root.nextPageUrl;const pages=new Set();
     while(next&&!pages.has(next)&&count<cap){pages.add(next);const r=await this.fetch(site,next);const parsed=parsePage(r.html,r.finalUrl,site);if(!parsed.complete||parsed.nativeThreadId!==root.nativeThreadId)throw Error('TINHTE_COMMENT_PAGE_INVALID');this.state.savePage(site,parsed,this.metadata(r),{since:this.since});for(const p of parsed.posts)ids.add(p.nativePostId);count++;next=parsed.nextPageUrl;}
     comments={complete:!next&&ids.size===root.declaredTotal,coverage:next?'comment_page_limit':ids.size===root.declaredTotal?'comments_verified':'embedded_only'};
    }else comments=await collectComments({site,root,evidenceDirectory:this.evidenceDirectory,maxPages:cap,save:async(page,meta)=>{this.state.savePage(site,page,meta,{since:this.since});this.event(site,meta.finalUrl,'public_comment_page',{posts:page.posts.length,evidence:meta.evidenceFile});}});
    this.state.status(row,comments.complete?1:0,comments.complete?null:comments.coverage,null,comments.complete?site.pollSeconds*1000:300000);return;
   }
   const scan=this.state.startScan(row,root.lastPage);
   let url=resume||(root.lastPage>1?root.lastPageUrl:null);
   if(url&&topicUrl(url,site)!==root.threadUrl)throw Error('PAGINATION_TOPIC_CHANGED');
   while(url&&url!==row.url&&!visited.has(url)&&count<cap&&!this.stopped){
    visited.add(url);resume=url;const response=await this.fetch(site,url);const page=parsePage(response.html,response.finalUrl,site);
    if(page.nativeThreadId!==root.nativeThreadId||page.threadUrl!==root.threadUrl)throw Error('PAGINATION_TOPIC_CHANGED');
    if(!page.complete)throw Error('COMMENT_PAGE_PARSE_'+page.rejected.map(x=>x.reason).join(';'));
    this.state.savePage(site,page,this.metadata(response),{since:this.since});count++;
    this.event(site,url,'comment_page',{posts:page.posts.length,currentPage:page.currentPage,evidence:response.evidenceFile});
    const dated=page.posts.filter(p=>p.role==='forumComment');const allOld=dated.length&&dated.every(p=>Date.parse(p.publishedDate)<this.since);
    const times=page.posts.map(p=>Date.parse(p.publishedDate));const ordered=times.every((t,i)=>!i||t>=times[i-1]);
    if(allOld&&ordered||page.currentPage<=scan.floor){url=null;break;}
    url=page.currentPage>2?page.prevPageUrl:null;
    if(page.currentPage>2&&!url)throw Error('PREVIOUS_PAGE_LINK_MISSING');
   }
   if(url&&(count>=cap||this.stopped)){this.state.status(row,0,'page_limit_resume',url,0);return;}
   if(url&&visited.has(url))throw Error('PAGINATION_LOOP');
   this.state.completeScan(row,scan.target,site.pollSeconds*1000);
  }catch(e){this.state.status(row,0,e.message,resume,300000);this.event(site,row.url,'topic_failed',{reason:e.message,resume});}
 }
 async round(round=0){
  const queue=this.sites.filter(s=>round%5===0||s.priority===1||this.state.hasUnscheduled?.(s.domain));let index=0;
  await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{while(index<queue.length&&!this.stopped){const site=queue[index++];await this.seeds(site);const limit=this.state.hasUnscheduled?.(site.domain)?Math.max(this.maxTopicsPerSite,this.maxCatchupTopicsPerSite||this.maxTopicsPerSite):this.maxTopicsPerSite;for(const row of this.state.ready(site.domain,limit)){if(this.stopped)break;await this.topic(site,row);}}}));
 }
 async run({once=true}={}){this.owner=this.state.lock();const heartbeat=setInterval(()=>{try{this.state.heartbeat(this.owner);}catch(e){this.stopped=true;this.onEvent({kind:'lease_lost',reason:e.message});}},20000);try{let round=0;do{await this.round(round++);if(!once&&!this.stopped)await new Promise(resolve=>{this.wake=resolve;this.timer=setTimeout(resolve,60000);});}while(!once&&!this.stopped);}finally{clearInterval(heartbeat);clearTimeout(this.timer);await this.transport.close();this.state.unlock(this.owner);}}
 stop(){this.stopped=true;if(this.wake)this.wake();}
}
