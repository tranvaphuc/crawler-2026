import test from 'node:test';
import assert from 'node:assert/strict';
import {seedTransientFailurePolicies,isConfiguredTransientSeedFailure} from '../src/web/newsSeedTransientFailures.mjs';

test('verified publishers can opt into temporary connection and server failure recovery',()=>{
  const policies=seedTransientFailurePolicies([
    {domain:'recovered.test',config:{discovery:{retryTransientHttpStatuses:[500,502,503,504,403,404,429],retryTransientNetworkErrors:['ECONNRESET','ECONNABORTED','ETIMEDOUT','EPIPE','EAI_AGAIN','ENOTFOUND','access_blocked','missing_body']}}},
    {domain:'unchanged.test',config:{}},
    {domain:'malformed.test',config:{discovery:{retryTransientHttpStatuses:500,retryTransientNetworkErrors:'ECONNRESET'}}}
  ]);
  for(const reason of ['http_500','http_502','http_503','http_504','ECONNRESET','ECONNABORTED','ETIMEDOUT','EPIPE','EAI_AGAIN']){
    assert.equal(isConfiguredTransientSeedFailure(policies,'recovered.test',reason),true);
    assert.equal(isConfiguredTransientSeedFailure(policies,'unchanged.test',reason),false);
    assert.equal(isConfiguredTransientSeedFailure(policies,'malformed.test',reason),false);
  }
  for(const reason of ['http_403','http_404','http_429','ENOTFOUND','access_blocked','missing_body'])assert.equal(isConfiguredTransientSeedFailure(policies,'recovered.test',reason),false);
});

test('network-only recovery policies do not require an HTTP status policy',()=>{
  const policies=seedTransientFailurePolicies([{domain:'network.test',config:{discovery:{retryTransientNetworkErrors:['ECONNRESET']}}}]);
  assert.equal(isConfiguredTransientSeedFailure(policies,'network.test','ECONNRESET'),true);
  assert.equal(isConfiguredTransientSeedFailure(policies,'network.test','http_502'),false);
});
