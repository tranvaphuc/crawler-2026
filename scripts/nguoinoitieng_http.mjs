// Bound headers AND body consumption even when the transport ignores AbortSignal.
// The losing transport promise has no database side effects.
export async function fetchTextWithDeadline(url,{timeoutMs=45000,fetchImpl=globalThis.fetch,...options}={}){
  const controller=new AbortController();let timer;
  const deadline=new Promise((_,reject)=>{
    timer=setTimeout(()=>{
      const error=new Error('REQUEST_DEADLINE_'+timeoutMs);error.code='REQUEST_DEADLINE';
      reject(error);controller.abort(error);
    },timeoutMs);
  });
  const request=(async()=>{
    const response=await fetchImpl(url,{...options,signal:controller.signal});
    const body=await response.text();
    return {response,body};
  })();
  try{return await Promise.race([request,deadline]);}
  finally{clearTimeout(timer);}
}
