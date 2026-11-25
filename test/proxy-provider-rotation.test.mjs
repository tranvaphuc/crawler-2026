import test from'node:test';import assert from'node:assert/strict';import{createProxyVnRotator}from'../scripts/proxyvn_rotator.js';

test('an explicit batch network is sent to the provider and a different reported network is rejected',async()=>{
 const requests=[];
 let received='VNPT';
 const acquire=createProxyVnRotator('fixture',{request:async(_url,values)=>{
  requests.push(values);
  return {status:100,proxyhttp:'127.0.0.1:8000','Nha Mang':received,message:'proxy nay se die sau 1000s'};
 }});
 assert.equal((await acquire({requestedNetwork:'vnpt'})).providerNetwork,'vnpt');
 assert.equal(requests[0].nhamang,'vnpt');
 assert.equal(requests[0].tinhthanh,'0');
 received='FPT';
 await assert.rejects(acquire({requestedNetwork:'viettel'}),error=>error.code==='PROXY_API_NETWORK_MISMATCH'&&error.retryAfterMs===60000);
});
test('normal acquisitions keep existing provider parameters while standby refresh chooses a different documented network',async()=>{const calls=[],responses=[{status:100,proxyhttp:'127.0.0.1:8001::','Nha Mang':'fpt',message:'proxy nay se die sau 1000s'},{status:100,proxyhttp:'127.0.0.2:8002::','Nha Mang':'viettel',message:'proxy nay se die sau 1000s'},{status:100,proxyhttp:'127.0.0.3:8003::','Nha Mang':'vnpt',message:'proxy nay se die sau 1000s'}],acquire=createProxyVnRotator('fixture',{request:async(url,values)=>{calls.push({url,values});return responses.shift();}});const first=await acquire();assert.equal(first.providerNetwork,'fpt');await acquire({rotateNetwork:true,previousNetwork:first.providerNetwork});await acquire({rotateNetwork:true});assert.deepEqual(calls.map(x=>x.values),[{key:'fixture'},{key:'fixture',nhamang:'viettel',tinhthanh:'0'},{key:'fixture',nhamang:'vnpt',tinhthanh:'0'}]);assert.ok(calls.every(x=>x.url==='https://proxyxoay.shop/api/get.php'));});
test('network rotation keeps account-key resolution, cooldown and credential handling inside the existing provider flow',async()=>{const calls=[],responses=[{status:101,message:'key invalid'},{keyxoay:'resolved-fixture-key'},{status:100,proxyhttp:'127.0.0.1:8000:user:private','Nha Mang':'fpt',message:'proxy nay se die sau 1000s'}],acquire=createProxyVnRotator('account-fixture',{request:async(url,values)=>{calls.push({url,values});return responses.shift();}});const proxy=await acquire({rotateNetwork:true,previousNetwork:'vnpt'});assert.equal(proxy.password,'private');assert.equal(calls[0].values.nhamang,'fpt');assert.deepEqual(calls[1].values,{key:'account-fixture'});assert.deepEqual(calls[2].values,{key:'resolved-fixture-key',nhamang:'fpt',tinhthanh:'0'});const limited=createProxyVnRotator('fixture',{request:async()=>({status:102,message:'cho 59 giay'})});await assert.rejects(limited({rotateNetwork:true}),e=>e.code==='PROXY_API_COOLDOWN'&&e.retryAfterMs===60000);});

test('standby requests alternate networks if a provider response keeps reporting the previous network',async()=>{const requests=[],acquire=createProxyVnRotator('fixture',{request:async(_url,values)=>{requests.push(values);return{status:100,proxyhttp:'127.0.0.1:8000::','Nha Mang':'fpt',message:'proxy nay se die sau 1000s'};}});await acquire({rotateNetwork:true,previousNetwork:'fpt'});await acquire({rotateNetwork:true,previousNetwork:'fpt'});assert.deepEqual(requests.map(x=>x.nhamang),['viettel','vnpt']);});

test('an explicit server whitelist is included in normal and alternate-network acquisitions',async()=>{
 const calls=[],acquire=createProxyVnRotator('fixture',{whitelistIpv4:'203.0.113.12',request:async(_url,values)=>{calls.push(values);return{status:100,proxyhttp:'127.0.0.1:8000::',message:'proxy nay se die sau 1000s'};}});
 await acquire();await acquire({rotateNetwork:true});assert.equal(calls.length,2);assert.ok(calls.every(x=>x.whitelist==='203.0.113.12'));assert.equal(calls[0].nhamang,undefined);assert.equal(calls[1].nhamang,'viettel');
});
test('whitelist survives account-key resolution without entering the account-list request',async()=>{
 const calls=[],responses=[{status:101,message:'key invalid'},{keyxoay:'resolved-key'},{status:100,proxyhttp:'127.0.0.1:8000::',message:'proxy nay se die sau 1000s'}];
 await createProxyVnRotator('fixture',{whitelistIpv4:'203.0.113.12',request:async(url,values)=>{calls.push({url,values});return responses.shift();}})();
 assert.equal(calls[0].values.whitelist,'203.0.113.12');assert.deepEqual(calls[1].values,{key:'fixture'});assert.deepEqual(calls[2].values,{key:'resolved-key',whitelist:'203.0.113.12'});
});
test('invalid or unrestricted whitelist configuration is rejected before any provider call',()=>{
 for(const whitelistIpv4 of ['0.0.0.0','::1','203.0.113.1,203.0.113.2','auto','https://example.test',true])assert.throws(()=>createProxyVnRotator('fixture',{whitelistIpv4}),{code:'PROXY_CONFIG_INVALID'});
});
