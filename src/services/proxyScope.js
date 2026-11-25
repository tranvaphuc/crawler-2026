const platforms=new Set(['facebook','threads','instagram','youtube']);
export const PROXY_OPERATIONS=new Set(['source','source_page','source_group','source_user','comments','metrics','post_info','comment_info','resolve_source','resolve_post','share','post_details','search']);
export function proxyScope(target){
 const platform=target.platform,operation=target.apiOperation||target.operation||'metrics';
 const op=operation==='source'&&platform==='facebook'&&target.sourceType?`source_${target.sourceType}`:operation;
 if(!platforms.has(platform)||!PROXY_OPERATIONS.has(op))throw Object.assign(Error('PROXY_SCOPE_INVALID'),{code:'PROXY_SCOPE_INVALID'});
 return `${platform}.${op}`;
}
export function validProxyScope(scope){try{const [platform,apiOperation,...extra]=String(scope).split('.');return !extra.length&&proxyScope({platform,apiOperation})===scope;}catch{return false;}}
