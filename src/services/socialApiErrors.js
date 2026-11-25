/** Inspect only native API error envelopes, never arbitrary post/comment text. */
export function publicApiIssue(responses = [], {ignoreError=()=>false} = {}) {
  let issue = null;
  const rank = s => s==='rate_limited' ? 3 : s==='auth_required' ? 2 : 1;
  for (const raw of responses) {
    let lines=[raw];
    if(typeof raw==='string'){const clean=raw.replace(/^for\s*\(;;\);\s*/, '');try{lines=[JSON.parse(clean)];}catch{lines=clean.split('\n');}}

    for (const line of lines) {
      let v; try { v = typeof line==='string' ? JSON.parse(line) : line; } catch { continue; }
      if (!v || typeof v!=='object') continue;
      const errors = (Array.isArray(v.errors) ? v.errors : v.error ? [v.error] : v.status==='fail' ? [{message:v.message}] : []).filter(e=>!ignoreError(e,v));
      if (!errors.length) continue;
      const signature = errors.map(e=>typeof e==='object' ? `${e.code || ''} ${e.extensions?.code || ''} ${e.message || ''}` : String(e)).join(' ');
      const status = /RATE_LIMIT|TOO_MANY_REQUESTS|please wait a few minutes|try again later|\b429\b/i.test(signature) ? 'rate_limited' :
        /UNAUTHENTICATED|LOGIN_REQUIRED|login_required|login required|not logged in|\b401\b|\b403\b|FORBIDDEN/i.test(signature) ? 'auth_required' : 'error';
      const next={status,reason:status==='rate_limited'?'UPSTREAM_API_RATE_LIMITED':status==='auth_required'?'UPSTREAM_API_AUTH_REQUIRED':'UPSTREAM_API_ERROR'};
      // Preserve machine diagnostics only; native descriptions/debug links can
      // contain private context and must never be copied to job/API responses.
      const codes=[...new Set(errors.flatMap(e=>{const code=e?.code??e?.extensions?.code;return /^(?:\d{1,16}|[A-Z][A-Z0-9_]{0,63})$/.test(String(code??''))?[String(code)]:[];}))];
      if(codes.length)next.upstreamCode=codes.join(',');
      if(errors.every(e=>typeof e?.is_transient==='boolean'))next.upstreamTransient=errors.every(e=>e.is_transient);
      if (!issue || rank(status)>rank(issue.status)) issue=next;
    }
  }
  return issue;
}

// Native 4686025 is "quoted post is no longer available". It does not
// invalidate the source author's own post. Only this exact optional projection
// is ignorable; identity, dates, cursor and connection errors stay fatal.
export function unavailableThreadsSourceQuote(error,body){
 const p=error?.path;
 if(String(error?.code)!=='4686025'||!Array.isArray(p)||p.length<11||p[0]!=='mediaData'||p[1]!=='edges'||!Number.isInteger(p[2])||p[2]<0||p[3]!=='node'||p[4]!=='thread_items'||!Number.isInteger(p[5])||p[5]<0||p[6]!=='post'||p[7]!=='text_post_app_info'||p[8]!=='share_info'||p[9]!=='quoted_post')return false;
 const post=body?.data?.mediaData?.edges?.[p[2]]?.node?.thread_items?.[p[5]]?.post;
 return /^\d+$/.test(String(post?.pk||post?.id||''))&&typeof post?.code==='string'&&!!post.code;
}
