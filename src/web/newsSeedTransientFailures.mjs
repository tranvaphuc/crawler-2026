const supportedStatuses=new Set([500,502,503,504]);
const supportedNetworkErrors=new Set(['ECONNRESET','ECONNABORTED','ETIMEDOUT','EPIPE','EAI_AGAIN']);

// Retry only explicitly configured publishers, on the next seed cycle.
// Article failures and permanent/access failures retain their review requirement.
export function seedTransientFailurePolicies(sources){
  const policies=new Map();
  for(const source of sources){
    const {retryTransientHttpStatuses:statuses,retryTransientNetworkErrors:networkErrors}=source.config?.discovery||{};
    const reasons=new Set((Array.isArray(statuses)?statuses:[]).filter(status=>supportedStatuses.has(status)).map(status=>'http_'+status));
    for(const error of Array.isArray(networkErrors)?networkErrors:[])if(supportedNetworkErrors.has(error))reasons.add(error);
    if(reasons.size)policies.set(source.domain,reasons);
  }
  return policies;
}

export function isConfiguredTransientSeedFailure(policies,site,reason){
  return policies?.get(site)?.has(reason)===true;
}
