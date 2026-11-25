import {createHash} from 'node:crypto';
import {readNetworkDiagnostic} from './readNetworkDiagnostics.js';
const code=value=>/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(String(value??''))?String(value):null;
const tag=value=>String(value).replace(/[^A-Za-z0-9]+/g,'_').toUpperCase();
const route=value=>{try{const u=new URL(value);return /^https?:$/.test(u.protocol)?u.origin+u.pathname:null;}catch{return null;}};
const publicUrl=value=>{try{const u=new URL(value),base=route(value);if(!base)return null;const out=new URL(base);for(const key of ['v','lc','id','comment_id','reply_comment_id']){const v=u.searchParams.get(key);if(v&&(/^(?:id|comment_id|reply_comment_id)$/.test(key)?/^\d{1,100}$/:/^[A-Za-z0-9_.-]{1,200}$/).test(v))out.searchParams.set(key,v);}return out.href;}catch{return null;}};
export function crawlerErrorDetails(result={},context={}){
 const error=context.error,network=readNetworkDiagnostic(result,{...context,includeNonNetwork:true});
 const last=network?.networkTimings?.findLast(t=>t.outcome==='error')||network?.networkTimings?.at(-1);
 const originalReason=code(result.reason)||code(error?.codeName)||code(error?.code)||code(error?.message)||('UNCLASSIFIED_'+tag(error?.name||'ERROR'));
 const native=value=>/^E(?:CONN|AI_|HOST|NET|PIPE|TIME|NOTFOUND)|^ERR_(?:TLS|SSL|SOCKET)|^Z_|CERT|^HPE_/.test(String(value||''))?code(value):null;
 const nativeCode=code(last?.nativeCode)||code(result.transport?.nativeCode)||native(error?.cause?.code)||native(error?.origError?.code)||native(result.upstreamCode);
 const httpStatus=[result.upstreamHttpStatus,result.httpStatus,last?.httpStatus,error?.statusCode,error?.status,error?.cause?.statusCode,error?.cause?.status].find(x=>Number.isInteger(x)&&x>=100&&x<=599)??null;
 const apiCode=code(result.apiCode??result.upstreamContext?.apiCode??(/^\d+$/.test(String(result.upstreamCode??''))?result.upstreamCode:null));
 const boundaryPhase=result.transport?.failurePhase!=='read_work'?code(result.transport?.failurePhase):null;
 const phase=code(context.phase)||boundaryPhase||(last?.phase==='complete'?'http_response':code(last?.phase))||code(result.transport?.failurePhase)||(/PROXY_MANAGER|PROXY_REQUIRED|PROXY_RETRY_ENDPOINT/.test(originalReason)?'proxy_assignment':/NETWORK|TIMEOUT|ECONN|TLS|PROXY/.test(originalReason)?'unobserved':'reader_result');
 const operation=code(result.upstreamOperation)||code(context.operation)||null;
 const query=code(result.upstreamQuery)||null,stage=code(result.upstreamContext?.stage)||code(result.stage)||null;
 const errorType=code(error?.name)||null,terminalReason=code(context.terminalReason)||null;
 const esError=error?.esError||error?.body?.error||error?.cause?.body?.error,esErrorType=code(esError?.type),esCauseType=code(esError?.caused_by?.type),esField=code(esError?.reason?.match(/(?:field|parse) \[([A-Za-z0-9_.]+)\]/)?.[1]);
 const stackFrames=error?.stack?.split('\n').slice(1,5).map(s=>s.trim()).filter(s=>/^at [A-Za-z0-9_./: ()<>\[\]-]+$/.test(s))||[];
 const stackSite=/^(?:UNCLASSIFIED|INTERNAL)_/.test(originalReason)?stackFrames[0]||null:null;
 const causeType=code(error?.cause?.name),causeCode=code(error?.cause?.code);
 const dimensions={originalReason,phase,nativeCode,httpStatus,connectStatus:last?.connectStatus??null,apiCode,operation,query,stage,errorType,terminalReason,esErrorType,esCauseType,esField,causeType,causeCode,stackSite,bodyEncoding:last?.bodyEncoding??null,wireComplete:last?.wireComplete??null,responseAborted:last?.responseAborted??null,syscall:last?.syscall??null};
 const wireState=/response_body|response_decode/.test(phase)?last?.wireComplete===true?'WIRE_COMPLETE':last?.wireComplete===false?'WIRE_INCOMPLETE':'WIRE_UNOBSERVED':null;
 const full=[originalReason,phase,nativeCode,httpStatus&&'HTTP_'+httpStatus,apiCode&&'API_'+apiCode,dimensions.bodyEncoding,wireState,operation,query,stage,errorType,terminalReason,esErrorType,esCauseType,esField,causeType,causeCode,stackSite].filter(Boolean).map(tag).join('__');
 const errorCode=full.length<=160?full:full.slice(0,139)+'__'+createHash('sha256').update(full).digest('hex').slice(0,16);
 return{version:1,code:errorCode,groupKey:createHash('sha256').update(JSON.stringify({queue:context.queue,platform:context.platform,...dimensions})).digest('hex'),...dimensions,
  requestRoute:route(last?.route),elapsedMs:last?.elapsedMs??null,bodyEncoding:last?.bodyEncoding??null,wireBytes:last?.wireBytes??null,decodedBytes:last?.decodedBytes??null,wireComplete:last?.wireComplete??null,
  proxyEndpoint:network?.proxyEndpoint||null,network,authGate:result.authGate?{classification:code(result.authGate.classification),confirmed:result.authGate.confirmed===true,stage:code(result.authGate.stage),evidence:code(result.authGate.evidence)}:null,
  esStatus:error?.statusCode??error?.status??null,stackFrames};
}
export function publicErrorCase(job){
 return{sourceId:job.data?.source?._id??null,sourceUrl:publicUrl(job.data?.source?.url),postUrl:publicUrl(job.data?.parent?.url||job.data?.item?.url),postId:job.data?.parent?.systemId||job.data?.item?.id||null,manualRetryOperationId:job.data?.manualRetry?.operationId||null};
}
// Bulk callers and UID single-flight lookups may share one rejected Error.
// Never mutate it: another job must classify the same original evidence.
export function isolatedClassifiedError(error,detail,originalReason){
 const copy=new Error(detail.code,{cause:error});
 if(error instanceof Error)Object.setPrototypeOf(copy,Object.getPrototypeOf(error));
 // Driver subclasses can expose getter-only name/code on their prototype.
 // Define own metadata instead of assigning through those inherited accessors.
 Object.defineProperties(copy,{
  name:{value:error?.name||'Error',writable:true,configurable:true},
  code:{value:detail.code,writable:true,configurable:true,enumerable:true},
  originalFlowReason:{value:originalReason,writable:true,configurable:true,enumerable:true},
  flowDiagnostic:{value:detail,writable:true,configurable:true,enumerable:true}
 });
 return copy;
}
