import test from 'node:test';import assert from 'node:assert/strict';
import {prepareCrawlSourceInput,sourceIdentityChanged,exactPostCommentCount,commentCountDecision} from '../src/services/crawlerV8Policy.js';
import {createSystemInputAdapter} from '../src/services/socialSystemReference.js';
const source={platform:'facebook',type:'user',nativeId:'123456',url:'https://www.facebook.com/123456'};
function runtime(identity){let calls=0;return{runtime:{prepareInput:createSystemInputAdapter({resolveSource:async()=>{calls++;return identity;}})},calls:()=>calls};}
test('a numeric URL labelled user cannot bypass live resolution; migrated Page ID is detected',async()=>{
 const f=runtime({platform:'facebook',id:'987654',profileId:'123456',type:'page',idVerified:true,evidence:'matched_profile.delegate_page.id',status:'resolved'});
 const b=await prepareCrawlSourceInput(f.runtime,source);assert.equal(f.calls(),1);assert.equal(b.sourceType,'page');assert.equal(b.reference.id,'987654');assert.equal(sourceIdentityChanged(source,b),true);
});
test('explicit personal metadata preserves User even for a professional personal profile',async()=>{
 const f=runtime({platform:'facebook',id:'123456',profileId:'123456',type:'user',idVerified:true,evidence:'matched_User.explicit_personal_profile',status:'resolved'});
 const b=await prepareCrawlSourceInput(f.runtime,source);assert.equal(f.calls(),1);assert.equal(sourceIdentityChanged(source,b),false);
});
test('a same-ID change of type is not silently indexed under the old _type',async()=>{
 const f=runtime({platform:'facebook',id:'123456',type:'page',idVerified:true,evidence:'matched_Page.id',status:'resolved'});
 assert.equal(sourceIdentityChanged(source,await prepareCrawlSourceInput(f.runtime,source)),true);
});
test('stored labels and routing userID alone are not live identity evidence',async()=>{
 const f=runtime({platform:'facebook',id:'123456',type:'user',idVerified:true,evidence:'rootView.props.userID',status:'resolved'});
 await assert.rejects(()=>prepareCrawlSourceInput(f.runtime,source),/SOURCE_IDENTITY_UNVERIFIED/);
 const bad=runtime({platform:'facebook',id:null,type:null,idVerified:false,reason:'SOURCE_ID_NOT_IN_PUBLIC_RESPONSE'});
 await assert.rejects(()=>prepareCrawlSourceInput(bad.runtime,source),/SOURCE_ID_NOT_IN_PUBLIC_RESPONSE/);
});
test('Group remains a distinct source type',async()=>{
 let input;const b=await prepareCrawlSourceInput({prepareInput:async x=>(input=x,x)},{...source,type:'group',url:'https://www.facebook.com/groups/123456'});assert.equal(input.sourceType,'group');assert.equal(b.url,'https://www.facebook.com/groups/123456');
});
test('only a confirmed zero skips comments; unknown counters require verification',()=>{
 assert.equal(commentCountDecision(exactPostCommentCount({metrics:{comment:0}})),'skip');
 assert.equal(commentCountDecision(exactPostCommentCount({metrics:{comment:3}})),'fetch');
 for(const x of [null,undefined,-1,NaN,'0',1.5])assert.equal(commentCountDecision(exactPostCommentCount({metrics:{comment:x}})),'verify');
 assert.equal(commentCountDecision(exactPostCommentCount({replyCount:0})),'verify');
});
async function liveIdentityFixture(data,url='https://www.facebook.com/123456'){
 const {createSocialInfoReaders}=await import('../src/services/socialInfo.js');
 const info=createSocialInfoReaders({getProxy:async()=>({server:'http://proxy.test:8888'}),makeSession:()=>({requests:1,request:async()=>({httpStatus:200,finalUrl:url,html:'<script type="application/json">'+JSON.stringify({data})+'</script>'}),close(){}})});
 return info.sourceInfo({platform:'facebook',id:'123456',url});
}
test('real failure shape: a pfbid Story projection cannot replace the numeric User ID',async()=>{
 const r=await liveIdentityFixture([{__typename:'User',id:'123456',name:'Person',url:'https://www.facebook.com/123456',is_additional_profile_plus:false},{id:'pfbidBAD',name:'Person',url:'https://www.facebook.com/123456',is_additional_profile_plus:false}]);assert.equal(r.id,'123456');assert.equal(r.type,'user');
});
test('different profile.php query IDs cannot match the requested source merely by pathname',async()=>{
 const url='https://www.facebook.com/profile.php?id=123456';const r=await liveIdentityFixture([{id:'123456',name:'Person',url,is_additional_profile_plus:false},{id:'999',name:'Other',url:'https://www.facebook.com/profile.php?id=999',is_additional_profile_plus:false}],url);assert.equal(r.id,'123456');
});
test('a numeric Story linked to a profile via story_fbid is not source identity evidence',async()=>{
 const r=await liveIdentityFixture([{id:'123456',name:'Person',url:'https://www.facebook.com/123456',is_additional_profile_plus:false},{id:'999',name:'Story',url:'https://www.facebook.com/123456?story_fbid=999',is_additional_profile_plus:false}]);assert.equal(r.id,'123456');
});

test('a source with no public identity is held rather than crawled or guessed',async()=>{const {classifyCrawlResult}=await import('../src/services/crawlerV8Es5.js');assert.equal(classifyCrawlResult({status:'unavailable',reason:'SOURCE_ID_NOT_IN_PUBLIC_RESPONSE'}),'blocked');assert.equal(classifyCrawlResult({status:'error',reason:'UPSTREAM_TIMEOUT'}),'retry');});
test('unknown audit type is live-resolved and redirected into the verified canonical source',async()=>{
 const f=runtime({platform:'facebook',id:'987654',type:'page',idVerified:true,evidence:'matched_Page.id',status:'resolved'});
 const unknown={...source,type:'unknown',nativeId:null};const b=await prepareCrawlSourceInput(f.runtime,unknown);assert.equal(f.calls(),1);assert.equal(sourceIdentityChanged(unknown,b),true);assert.equal(b.reference.type,'page');
});

test('a successful metrics response lacking an exact comment count retries verification, while auth/checkpoint stays blocked',async()=>{
 const {unverifiedCommentCountResult}=await import('../src/services/crawlerV8Policy.js'),{classifyCrawlResult}=await import('../src/services/crawlerV8Es5.js');
 for(const status of ['ok','partial','unavailable']){const r=unverifiedCommentCountResult({status,metrics:{comment:null}});assert.equal(r.reason,'COMMENT_COUNT_UNVERIFIED');assert.equal(classifyCrawlResult(r),'retry');}
 for(const status of ['auth_required','security_checkpoint'])assert.equal(classifyCrawlResult(unverifiedCommentCountResult({status,reason:'LOGIN_OR_CHECKPOINT'})),'blocked');
 assert.equal(classifyCrawlResult(unverifiedCommentCountResult({status:'rate_limited',reason:'HTTP_429',retryAfterMs:3000})),'retry');
});
test('comment/network/login failures cannot erase a successful source identity resolution',async()=>{const {shouldInvalidateSourceIdentity}=await import('../src/services/crawlerV8Policy.js');for(const code of ['UPSTREAM_NETWORK_ERROR','LOGIN_OR_CHECKPOINT','INTERNAL_TypeError','PARENT_POST_NOT_COMMITTED','COMMENT_PARENT_MISMATCH'])assert.equal(shouldInvalidateSourceIdentity({code},{attempted:true,verified:true}),false);assert.equal(shouldInvalidateSourceIdentity({code:'SOURCE_IDENTITY_UNVERIFIED'},{attempted:true,verified:false}),true);assert.equal(shouldInvalidateSourceIdentity({code:'UPSTREAM_NETWORK_ERROR'},{attempted:true,verified:false}),false);});
test('only an actual stored native identity receipt can recover a status invalidated by unrelated failure',async()=>{const {hasVerifiedSourceReceipt,canRestoreSourceReceipt}=await import('../src/services/crawlerV8Policy.js'),s={nativeId:'123',type:'user',identityStatus:'unverified',identityFailure:'LOGIN_OR_CHECKPOINT',identityProof:{nativeId:'123',type:'user',evidence:'matched_User.explicit_personal_profile',checkedAt:new Date()}};assert.equal(hasVerifiedSourceReceipt(s),true);assert.equal(canRestoreSourceReceipt(s),true);for(const changed of [{identityFailure:'SOURCE_IDENTITY_UNVERIFIED'},{canonicalSourceId:'alias'},{identityProof:{...s.identityProof,evidence:'audit_user_label'}},{identityProof:{...s.identityProof,nativeId:'999'}}])assert.equal(canRestoreSourceReceipt({...s,...changed}),false);});
test('unambiguous ES5 siteId history supports an explicit Page/User receipt without treating mixed types as proof',async()=>{
 const {hasVerifiedSourceReceipt,hasVerifiedEs5SiteIdReceipt}=await import('../src/services/crawlerV8Policy.js');
 const source={platform:'facebook',type:'user',nativeId:'123',identityStatus:'verified',identityProof:{nativeId:'123',type:'user',evidence:'es5_siteid_unambiguous_v1',checkedAt:new Date().toISOString(),es5SiteId:{siteId:'123',matchedType:'fbUserTopic',matchedCount:25,conflictingPostTypes:0,timedOut:false,failedShards:0}}};
 assert.equal(hasVerifiedEs5SiteIdReceipt(source),true);assert.equal(hasVerifiedSourceReceipt(source),true);
 for(const changed of [{type:'page'},{canonicalSourceId:'other'},{identityProof:{...source.identityProof,es5SiteId:{...source.identityProof.es5SiteId,conflictingPostTypes:12}}},{identityProof:{...source.identityProof,es5SiteId:{...source.identityProof.es5SiteId,timedOut:true}}}])assert.equal(hasVerifiedSourceReceipt({...source,...changed}),false);
});
