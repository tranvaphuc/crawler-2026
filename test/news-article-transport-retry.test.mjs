import test from 'node:test';import assert from 'node:assert/strict';
import {shouldRetryArticleTransientHttp} from '../src/web/newsArticleTransportRetry.mjs';

test('only a configured temporary article response may use one alternate route',()=>{
  const site={http:{retryTransientArticleStatuses:[502,503,504,500,403,404,429]}};
  for(const statusCode of [502,503,504]){
    assert.equal(shouldRetryArticleTransientHttp(site,{role:'article',statusCode}),true);
    assert.equal(shouldRetryArticleTransientHttp(site,{role:'article',statusCode,alreadyRetried:true}),false);
    assert.equal(shouldRetryArticleTransientHttp({}, {role:'article',statusCode}),false);
    assert.equal(shouldRetryArticleTransientHttp(site,{role:'seed',statusCode}),false);
    assert.equal(shouldRetryArticleTransientHttp(site,{role:'publication_feed',statusCode}),false);
    assert.equal(shouldRetryArticleTransientHttp(site,{role:'article',method:'POST',statusCode}),false);
    assert.equal(shouldRetryArticleTransientHttp(site,{role:'article',statusCode,error:'NETWORK_ERROR'}),false);
  }
  for(const statusCode of [200,301,400,401,403,404,429,500])assert.equal(shouldRetryArticleTransientHttp(site,{role:'article',statusCode}),false);
});

test('a publisher policy can authorize only its observed response status',()=>{
  const site={http:{retryTransientArticleStatuses:[502]}};
  assert.equal(shouldRetryArticleTransientHttp(site,{role:'article',statusCode:502}),true);
  assert.equal(shouldRetryArticleTransientHttp(site,{role:'article',statusCode:503}),false);
  assert.equal(shouldRetryArticleTransientHttp({http:{retryTransientArticleStatuses:'502'}},{role:'article',statusCode:502}),false);
});
