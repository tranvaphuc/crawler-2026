const numeric=value=>typeof value==='string'&&/^\d+$/.test(value);
const nativeFeedback=value=>typeof value==='string'&&value.length<=4096&&/^feedback:(?:\d+(?:_\d+)?|pfbid[A-Za-z0-9]+)$/.test(Buffer.from(value,'base64').toString('utf8'));

// Use only aliases observed on the exact native post/comment in this bootstrap.
// Recommended stories keep their own post IDs and cannot replace the target.
export function collectFacebookFeedbackIds(roots){
 const ids=new Map();
 function walk(value,postId=null,depth=0){
  if(!value||typeof value!=='object'||depth>75)return;
  const current=numeric(value.post_id)&&value.__typename!=='Comment'?value.post_id:postId;
  if(numeric(value.post_id)&&value.__typename!=='Comment'&&nativeFeedback(value.feedback?.id))ids.set(`feedback:${value.post_id}`,value.feedback.id);
  if(current&&numeric(value.legacy_fbid)&&nativeFeedback(value.feedback?.id))ids.set(`feedback:${current}_${value.legacy_fbid}`,value.feedback.id);
  for(const child of Object.values(value))if(child&&typeof child==='object')walk(child,current,depth+1);
 }
 for(const root of roots)walk(root);
 return ids;
}

export function bindFacebookFeedbackVariables(variables,ids){
 if(typeof variables!=='string'||!ids?.size)return variables;
 let parsed;try{parsed=JSON.parse(variables);}catch{return variables;}
 if(typeof parsed.id!=='string')return variables;
 const native=ids.get(Buffer.from(parsed.id,'base64').toString('utf8'));
 return native?JSON.stringify({...parsed,id:native}):variables;
}
