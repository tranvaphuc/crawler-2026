import {serializeCrawlItem} from './crawlerV8Es5.js';
// Only a trusted reader may mark rows from earlier successful native pages.
// Apply the same identity/date/parent guards as normal ES5 ingestion.
export function verifiedBufferedItems(result,source,parent=null){
 if(result?.bufferedItemsVerified!==true||result.identityVerified!==true)return {items:[],rejected:0};
 const items=[];let rejected=0;
 for(const item of result.items||[]){try{serializeCrawlItem(item,source,{parent});items.push(item);}catch{rejected++;}}
 return {items,rejected};
}
