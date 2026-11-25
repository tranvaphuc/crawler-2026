const temporaryStatuses=new Set([502,503,504]);

// One alternate route may be tried before the current article job is held.
// This does not reopen any historical article failure or relax access checks.
export function shouldRetryArticleTransientHttp(site,{role,method='GET',statusCode,error,alreadyRetried=false}={}){
  return role==='article'&&method==='GET'&&!alreadyRetried&&!error&&temporaryStatuses.has(statusCode)
    &&Array.isArray(site?.http?.retryTransientArticleStatuses)&&site.http.retryTransientArticleStatuses.includes(statusCode);
}
