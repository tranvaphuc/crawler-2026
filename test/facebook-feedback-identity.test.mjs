import test from'node:test';import assert from'node:assert/strict';
import{collectFacebookFeedbackIds,bindFacebookFeedbackVariables}from'../src/services/facebookFeedbackIdentity.js';
import{createAnonymousFacebookGraphqlRequest}from'../src/services/facebookAnonymousGraphql.js';
const feedback=id=>Buffer.from('feedback:'+id).toString('base64');
const roots=[{__typename:'Story',post_id:'100',feedback:{id:feedback('pfbidRoot')},comments:[{__typename:'Comment',legacy_fbid:'200',feedback:{id:feedback('pfbidParent')}}]},{__typename:'Story',post_id:'999',feedback:{id:feedback('pfbidOther')}}];
test('binds only the observed native entity and preserves numeric pagination identity',()=>{
 const ids=collectFacebookFeedbackIds(roots);const variables={id:feedback('100'),focusCommentID:null,commentsAfterCursor:'keep'};
 assert.deepEqual(JSON.parse(bindFacebookFeedbackVariables(JSON.stringify(variables),ids)),{...variables,id:feedback('pfbidRoot')});
 assert.equal(JSON.parse(bindFacebookFeedbackVariables(JSON.stringify({id:feedback('100_200')}),ids)).id,feedback('pfbidParent'));
 assert.equal(JSON.parse(bindFacebookFeedbackVariables(JSON.stringify({id:feedback('101')}),ids)).id,feedback('101'));
});
test('anonymous requests bind fresh bootstrap feedback aliases before the initial GraphQL read without sending login credentials',async()=>{
 const calls=[],url='https://www.facebook.com/groups/123/posts/100/';const html='<script type="application/json">'+JSON.stringify({require:[['CurrentUserInitialData',[],{USER_ID:'0'}],['LSD',[],{token:'owned-context'}]],stories:roots})+'</script>';
 const session={async request(url,options={}){calls.push({url,options});return{httpStatus:200,finalUrl:url,html:url.includes('/api/graphql/')?'{}':html};}};
 const request=createAnonymousFacebookGraphqlRequest(session,{bootstrapUrl:url});await request({variables:JSON.stringify({id:feedback('100')}),fb_dtsg:'do-not-send'},{});
 const form=new URLSearchParams(calls[1].options.body);assert.equal(JSON.parse(form.get('variables')).id,feedback('pfbidRoot'));assert.equal(form.get('__user'),'0');assert.equal(form.get('fb_dtsg'),null);
});
