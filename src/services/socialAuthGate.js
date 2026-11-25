import {readOnlyAssignedJson as assignedJson} from './socialMetrics.js';
// Evidence is deliberately small: never retain HTML, cookies, tokens or redirect queries.
export const isAuthGate = r => r?.authGate?.classification==='source_restriction'||['auth_required','security_checkpoint'].includes(r?.status)||['AUTH_REQUIRED','LOGIN_OR_CHECKPOINT','UPSTREAM_API_AUTH_REQUIRED','LOGIN_REQUIRED_FOR_MORE_DATA'].includes(r?.reason);
export function sourceRestrictionEvidence(snapshot){
 const html=String(snapshot?.html||'');
 if(html.includes('channelAgeGateRenderer')){
  const root=assignedJson(html,'ytInitialData'),pending=root?[root]:[];
  while(pending.length){const node=pending.pop();if(!node||typeof node!=='object')continue;
   if(node.channelAgeGateRenderer?.signInButton)return {classification:'source_restriction',evidence:'native_channel_age_gate',confirmed:true};
   for(const child of Object.values(node))if(child&&typeof child==='object')pending.push(child);
  }
 }
 if(!/(?:years old|old enough|age.restricted|restricted profile)/i.test(html))return null;
 const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
 // A generic login invitation is not proof that a source requires authentication.
 if(/(?:you must be \d+ years old|confirm you are old enough|age.restricted|restricted profile)/i.test(text)&&/log\s*in|sign\s*in/i.test(text))return {classification:'source_restriction',evidence:'explicit_age_restriction',confirmed:true};
 return null;
}
export function gateSummary({result,endpoints=[],publicBefore=false,classification,confirmed=false}){
 return {...result.authGate,classification,confirmed,stage:publicBefore?'after_public_data':'initial',distinctEndpoints:new Set(endpoints.filter(Boolean)).size};
}
