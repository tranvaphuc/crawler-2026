import test from 'node:test';import assert from 'node:assert/strict';
import {createFacebookLocalUidRoutes} from '../src/services/facebookLocalUidRoutes.js';
const bootstrap=()=>({httpStatus:200,finalUrl:'https://www.facebook.com/zuck',html:'<script type="application/json">'+JSON.stringify([['LSD',null,{token:'PRIVATE_LSD'}],['DTSGInitialData',null,{token:'PRIVATE_DTSG'}],['CurrentUserInitialData',null,{USER_ID:'111'}]])+'</script>'});
const route=(id,name='ProfileCometTimelineRoute')=>({result:{type:'route',exports:{canonicalRouteName:name,rootView:{props:{userID:id}}}}});
const response=payloads=>({httpStatus:200,finalUrl:'https://www.facebook.com/ajax/bulk-route-definitions/',html:'for (;;);'+JSON.stringify({payload:{payloads}})});
test('authenticated bulk lookup binds proofs to requested routes and reuses fresh context',async()=>{
 let contexts=0,calls=0;const lookup=createFacebookLocalUidRoutes({expectedActorId:'111',request:async(url,options)=>{if(!options){contexts++;return bootstrap();}calls++;assert.equal(options.routeForm.fb_dtsg,'PRIVATE_DTSG');assert.equal(options.routeForm['route_urls[0]'],'/one');return response({'/one':route('123'),'/unrelated':route('999')});}});
 const a=await lookup(['https://www.facebook.com/one','https://www.facebook.com/missing']);assert.equal(a.proofs.get('/one').id,'123');assert.equal(a.proofs.has('/unrelated'),false);assert.equal(a.missing.has('/missing'),true);assert.doesNotMatch(JSON.stringify([...a.proofs]),/PRIVATE_DTSG|PRIVATE_LSD/);await lookup(['https://www.facebook.com/one']);assert.equal(contexts,1);assert.equal(calls,2);
});
test('different authenticated account never dispatches a route lookup',async()=>{let calls=0;const lookup=createFacebookLocalUidRoutes({expectedActorId:'222',request:async()=>{calls++;return bootstrap();}});await assert.rejects(lookup(['https://www.facebook.com/one']),{code:'LOCAL_UID_AUTH_ACCOUNT_MISMATCH'});assert.equal(calls,1);});
test('bulk route redirects resolve native target IDs and stop at rate limits',async()=>{
 const lookup=createFacebookLocalUidRoutes({expectedActorId:'111',request:async(_url,options)=>!options?bootstrap():response({'/one':{result:{type:'route_redirect',redirect_result:route('123').result}}})});assert.equal((await lookup(['https://www.facebook.com/one'])).proofs.get('/one').id,'123');
 const limited=createFacebookLocalUidRoutes({expectedActorId:'111',request:async(_url,options)=>!options?bootstrap():({httpStatus:429,finalUrl:'https://www.facebook.com/ajax/bulk-route-definitions/',html:''})});await assert.rejects(limited(['https://www.facebook.com/one']),{code:'FACEBOOK_RATE_LIMITED'});
});
