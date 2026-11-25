// A native page may arrive before all of its per-post metadata. Deliver each
// verified post immediately; keep the native cursor until the page is finished.
export function takeReadySourceItems(state,items,{complete=false}={}){
 state.sourceEmittedIds ||=new Set();const rows=[];
 for(const item of items||[]){if(state.sourceEmittedIds.has(item.id))continue;if(!complete&&!Number.isFinite(Date.parse(item.createdAt)))continue;state.sourceEmittedIds.add(item.id);rows.push(item);}
 return rows;
}
