import HttpConnector from 'elasticsearch/src/lib/connectors/http.js';
import {createUnzip} from 'node:zlib';
// Bound decoded bytes before the legacy client can concatenate or JSON-parse them.
export class ForumBoundedEsConnection extends HttpConnector{
 request(params,callback){
  const options=this.makeReqParams(params),limit=8*1024*1024;let request,stream,finished=false,bytes=0,chunks=[],status=0,headers={};
  const finish=(error)=>{if(finished)return;finished=true;const body=error?undefined:Buffer.concat(chunks,bytes).toString('utf8');chunks=[];callback(error,body,status,headers);};
  const oversized=()=>{const error=Object.assign(new Error('FORUM_ES_RESPONSE_TOO_LARGE'),{code:'FORUM_ES_RESPONSE_TOO_LARGE'});finish(error);stream?.destroy();request?.destroy();};
  request=this.hand.request(options,incoming=>{status=incoming.statusCode;headers=incoming.headers;stream=/^(gzip|deflate)$/i.test(headers['content-encoding']||'')?incoming.pipe(createUnzip()):incoming;
   stream.on('data',chunk=>{if(finished)return;const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=buffer.length;if(bytes>limit){oversized();return;}chunks.push(buffer);});
   stream.on('error',finish);incoming.on('aborted',()=>finish(Object.assign(new Error('FORUM_ES_RESPONSE_ABORTED'),{code:'FORUM_ES_RESPONSE_ABORTED'})));stream.on('end',()=>finish());
  });
  request.on('error',finish);request.setNoDelay(true);request.setSocketKeepAlive(true);request.setHeader('Content-Length',params.body?Buffer.byteLength(params.body):0);request.end(params.body||undefined);
  return ()=>{if(finished)return;finished=true;chunks=[];stream?.destroy();request.destroy();};
 }
}
