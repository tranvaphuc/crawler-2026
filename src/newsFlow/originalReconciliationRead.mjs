import {reconcileOriginalArticles} from './baomoiOriginalBranch.mjs';

// A deferred read leaves the durable ES-check marker untouched. The producer
// can resume on its next normal tick without admitting an unchecked article.
export async function reconcileOriginalArticlesWhenAvailable(state,registry,es,{onDeferred=()=>{},limit=50}={}){
 try{await reconcileOriginalArticles(state,registry,es,limit);return true;}
 catch(error){
  const status=Number(error.statusCode||error.status)||null;
  const timeout=['ETIMEDOUT','ESOCKETTIMEDOUT'].includes(error.code)||['RequestTimeout','TimeoutError'].includes(error.name)||error.displayName==='RequestTimeout'||status===408||error.name==='StatusCodeError'&&/^Request Timeout after \d+ms$/.test(error.message);
  const unavailable=[429,502,503,504].includes(status);
  const incomplete=error.message==='ORIGINAL_ES_LOOKUP_INCOMPLETE';
  if(!timeout&&!unavailable&&!incomplete)throw error;
  onDeferred({event:'original_es_read_deferred',reason:timeout?'ES_READ_TIMEOUT':incomplete?'ES_READ_INCOMPLETE':'ES_READ_UNAVAILABLE',statusCode:status});
  return false;
 }
}
