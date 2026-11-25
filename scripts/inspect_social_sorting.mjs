// Read-only discovery; persist schema/sort/page-info summaries, never bootstrap tokens.
import fs from 'node:fs/promises';
import {createHttpExecutor}from'../src/services/socialHttpTransport.js';
import {snapshotPayloads,assignedJson}from'../src/services/socialMetrics.js';
import {walkContent,normalizeContentInput}from'../src/services/socialContent.js';
const run=createHttpExecutor(),out='outputs/social-ordering-audit-2026-10-23';await fs.mkdir(out,{recursive:true});
const cases=[['threads','source',{url:'https://www.threads.com/@hapas.vn'}],['threads','comments',{url:'https://www.threads.com/@dthh___n/post/DSl1YphAcpY'}],['threads','search',{platform:'threads',keyword:'HAPAS'}],['instagram','source',{url:'https://www.instagram.com/hapas.vn/'}],['instagram','comments',{url:'https://www.instagram.com/p/CciJju6P5In/'}],['youtube','source',{url:'https://www.youtube.com/@vtv24'}],['youtube','comments',{url:'https://www.youtube.com/watch?v=wlQndvtII1M'}],['youtube','search',{platform:'youtube',keyword:'HAPAS'}]];
const reports=[];
for(const[platform,operation,body]of cases){const target=normalizeContentInput(operation,body);const report=await run(target,async session=>{
 const snapshot=await session.request(target.url),all=[...snapshotPayloads(snapshot.html),assignedJson(snapshot.html,'ytInitialData')].filter(Boolean);const queries=[],connections=[],sorts=[],dates=[];
 for(const root of all)walkContent(root,(v,path)=>{
  if(v.queryID&&v.queryName)queries.push({name:v.queryName,docId:v.queryID,variableKeys:Object.keys(v.variables||{}),sortValues:Object.fromEntries(Object.entries(v.variables||{}).filter(([k,x])=>/sort|order|recent|first|last/i.test(k)&&['string','boolean','number'].includes(typeof x)&&String(x).length<80))});
  if(v.page_info)connections.push({path,keys:Object.keys(v),pageInfoKeys:Object.keys(v.page_info),next:v.page_info.has_next_page,previous:v.page_info.has_previous_page,count:v.edges?.length,total:v.total_count??v.count??null});
  for(const k of ['searchFilterRenderer','chipCloudChipRenderer','sortFilterSubMenuRenderer'])if(v[k]){const x=v[k];sorts.push({kind:k,path,label:x.title||x.text||x.label||null,status:x.status||null,selected:x.isSelected??x.selected??null,items:x.subMenuItems?.map(i=>({title:i.title,selected:i.selected,commandKeys:Object.keys(i.serviceEndpoint||{})}))});}
  if(v.selected_intent||v.sort_order||v.sorting_order)sorts.push({path,selectedIntent:v.selected_intent?.intent_token,sortOrder:v.sort_order||v.sorting_order});
  if(v.taken_at||v.created_at)dates.push({path,time:v.taken_at||v.created_at});
 });return{status:'checked',httpStatus:snapshot.httpStatus,queries,connections:connections.slice(0,30),sorts:sorts.slice(0,40),dates:dates.slice(0,5)};
 });reports.push({platform,operation,...report});console.log(JSON.stringify({platform,operation,...report}));await fs.writeFile(out+'/discovery.json',JSON.stringify(reports,null,2));}
