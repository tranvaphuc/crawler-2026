import {createSystemInputAdapter,ReferenceError} from '../services/socialSystemReference.js';
import {createResultBounder} from '../services/socialResultBounds.js';
import {disposeReadState} from '../services/socialLeaseState.js';
import {READ_STATE} from '../services/socialReadState.js';
import { jsonApiError, setRetryAfter, validateResult } from './apiResponse.js';
import { contentBase } from '../services/socialContent.js';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { normalizeContentInput, SocialContentInputError } from '../services/socialContent.js';
import { createSocialHttpContentReader } from '../services/socialHttpReaders.js';
import {createApiRequestGate} from '../services/apiRequestGate.js';
import {apiAwait,throwIfApiAborted} from '../services/apiRequestContext.js';

export function createContentCursorStore({ now = Date.now, ttlMs = 1800000, maxEntries = 1000, maxBytes=64000000 } = {}) {
  const states = new Map();
  const key = t => JSON.stringify([t.operation,t.platform,t.id,t.includeReplies,t.order,t.limit,t.requestedLimit,t.requestedCount,t.since,t.uploadDate]);
  function discard(k,preserveState){const state=states.get(k)?.readerState;states.delete(k);if(state&&state!==preserveState&&![...states.values()].some(v=>v.readerState===state))void disposeReadState(state).catch(()=>{});}
  function sweep(preserveState) { for (const [k,v] of states) if (v.expires<=now())discard(k,preserveState); }
  return {
    restore(target) {
      if(!target.cursor)return target;sweep();const s=states.get(target.cursor);
      if(!s||s.key!==key(target))throw new SocialContentInputError('Cursor expired or belongs to another request');
      const restored={...target,seenIds:s.ids,replayPages:s.pages};if(s.readerState)Object.defineProperty(restored,READ_STATE,{value:s.readerState});return restored;
    },
    async run(target,read) {
      if(!target.cursor)return read();
      const state=states.get(target.cursor);if(!state)throw new SocialContentInputError('Cursor expired');
      state.results ||= new Map();const key=String(target.limit);
      if(!state.results.has(key))state.results.set(key,Promise.resolve().then(read).then(result=>{if(!['ok','partial'].includes(result.status))state.results.delete(key);return result;},error=>{state.results.delete(key);throw error;}));
      return state.results.get(key);
    },
    issue(target,items,readerState) {
      sweep(readerState);
      if(readerState){const all=new Set([...states.values()].map(v=>v.readerState).filter(Boolean));all.add(readerState);let total=0;for(const state of all)total+=state.estimatedBytes||Buffer.byteLength(JSON.stringify(state));if(total>maxBytes)return null;}
      const ids=readerState?[]:[...new Set([...(target.seenIds||[]),...items.map(x=>x.id)])];
      if(ids.length>5000)return null;
      while(states.size>=maxEntries)discard(states.keys().next().value,readerState);
      const token=randomUUID();states.set(token,{key:key(target),ids,readerState,pages:(target.replayPages||0)+1,expires:now()+ttlMs});return token;
    }
  };
}
export function createSocialContentRouter({ read = createSocialHttpContentReader(), cursorStore = createContentCursorStore(), maxConcurrent = 2, prepareInput=createSystemInputAdapter(), boundResults=true,requestGates={} } = {}) {
  const router=express.Router(); if(boundResults)read=createResultBounder(read);
  const paths={source:'/api/social/source/posts',comments:'/api/social/post/comments',search:'/api/social/search'};
  for(const [operation,path] of Object.entries(paths))router.post(path,express.json({limit:'32kb'}),(requestGates[operation]||createApiRequestGate({name:operation,maxConcurrent})).wrap(async(req,res)=>{
    res.set('Cache-Control','no-store');let targets;
    try{
      if(operation==='search' && req.body?.keywords!==undefined && !Array.isArray(req.body.keywords)) throw new SocialContentInputError('keywords must be an array');
      if(operation==='search'&&Array.isArray(req.body?.keywords)) {
        if(req.body.keyword!==undefined||req.body.cursor||!req.body.keywords.length||req.body.keywords.length>10)throw new SocialContentInputError('Use 1..10 keywords without keyword/cursor, or a single keyword with cursor');
        const unique=[...new Set(req.body.keywords.map(x=>typeof x==='string'?x.trim():x))];
        targets=unique.map(keyword=>normalizeContentInput(operation,{...req.body,keyword}));
      }else targets=[normalizeContentInput(operation,await apiAwait(prepareInput(req.body,operation)))];
      targets=targets.map(t=>cursorStore.restore(t));
    }catch(error){throwIfApiAborted();setRetryAfter(res,error);return res.status(error instanceof ReferenceError?error.status:400).json({status:error.resultStatus|| (error instanceof ReferenceError&&error.status>=500?'error':error instanceof ReferenceError&&[404,422].includes(error.status)?'unavailable':'invalid_input'),retryAfterMs:error.retryAfterMs||null,...(error.status===200?{items:[],count:0,rootComments:0,replies:0,identityVerified:false,pagination:{nextCursor:null,hasMore:null,complete:false}}:{}),reason:error instanceof SocialContentInputError||error instanceof ReferenceError?error.message:'Invalid request'});}
    try{
      const results=[];
      for(const target of targets){
        const perform=async()=>{let result;
        try { result=validateResult(await apiAwait(read(target)),true); }
        catch { throwIfApiAborted();result={...contentBase(target),status:'error',reason:'INTERNAL_ERROR'}; }
        if(['ok','partial'].includes(result.status)&&(result.count>0||result[READ_STATE])&&result.pagination&&!result.pagination.complete&&result.pagination.hasMore!==false&&result.pagination.reason!=='NATIVE_PAGINATION_UNAVAILABLE'){
          result.pagination.nextCursor=cursorStore.issue(target,result.items,result[READ_STATE]);
          if(!result.pagination.nextCursor){result.pagination.reason='CURSOR_ITEM_LIMIT';await apiAwait(disposeReadState(result[READ_STATE]));}
        }
        if(!['ok','partial'].includes(result.status)&&result[READ_STATE])result.retryCursor=cursorStore.issue(target,result.items,result[READ_STATE]);
        return result;};
        const result=await apiAwait(cursorStore.run?cursorStore.run(target,perform):perform());
        results.push({...result,link:req.body.link??null,url:req.body.url??null,inputId:req.body.id??null});
        if(['rate_limited','auth_required','security_checkpoint','proxy_error','error','busy'].includes(result.status))break;
      }
      setRetryAfter(res,results.find(r=>Number.isFinite(r.retryAfterMs)&&r.retryAfterMs>0));
      return res.json(Array.isArray(req.body?.keywords)?{status:results.length===targets.length?'checked':'partial',successfulKeywords:results.filter(r=>['ok','partial'].includes(r.status)).length,failedKeywords:results.filter(r=>!['ok','partial'].includes(r.status)).length,results,unstartedKeywords:targets.slice(results.length).map(t=>t.keyword)}:results[0]);
    }catch{throwIfApiAborted();return res.status(500).json({status:'error',reason:'INTERNAL_ERROR'});}
  }));
  router.use(jsonApiError);
  return router;
}
