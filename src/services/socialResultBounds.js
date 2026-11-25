import {disposeReadState} from './socialLeaseState.js';
import {READ_STATE,attachReadState} from './socialReadState.js';
/** Count and date policy wraps native state without serializing tokens to the client. */
export function createResultBounder(read){return async target=>{
 const r=await read(target);if(!['source','comments','search'].includes(target.operation)||!['ok','partial'].includes(r.status))return r;
 const state=r[READ_STATE]||target[READ_STATE],prior=state?.policyReturned||0,max=target.requestedCount&&target.requestedCount!=='all'?target.requestedCount:20000;
 let rows=r.items,unknown=0,old=0;
 if(target.since){rows=rows.filter(x=>{const date=Date.parse(x.createdAt);if(!Number.isFinite(date)){unknown++;return false;}if(date<Date.parse(target.since)){old++;return false;}return true;});}
 rows=rows.slice(0,Math.max(0,max-prior));const total=prior+rows.length,countReached=total>=max;
 // A date found on a ranked/local page is not a safe global stop condition.
 const dateReached=target.since&&old>0&&unknown===0&&r.ordering?.serverFilterVerified===true&&!r.items.some(x=>x.pinned===true);
 const result={...r,items:rows,count:rows.length,rootComments:rows.filter(x=>x.type==='comment').length,replies:rows.filter(x=>x.type==='reply').length,
 limits:{requestedCount:target.requestedCount??null,pageSize:target.limit,maxResults:max,totalReturned:total,stopReason:countReached?'COUNT_REACHED':dateReached?'SINCE_REACHED':null},
 dateFilter:target.since?{since:target.since,excludedThisPage:old,unknownDateThisPage:unknown,verified:unknown===0,earlyStopVerified:!!dateReached}:null};
 if(target.since&&rows.length===0&&r[READ_STATE]&&!dateReached){result.phase='filtering';result.reason=unknown?'SOURCE_DATES_UNAVAILABLE':'DATE_FILTER_PAGE_EMPTY';}
 if(target.since&&unknown>0)result.reason='SOURCE_DATES_UNAVAILABLE';
 if(countReached||dateReached){await disposeReadState(state);result.pagination={...r.pagination,nextCursor:null,hasMore:false,complete:false,reason:countReached?'REQUESTED_COUNT_REACHED':'SINCE_REACHED'};return result;}
 if(state)state.policyReturned=total;if(r[READ_STATE])attachReadState(result,state);return result;
};}
