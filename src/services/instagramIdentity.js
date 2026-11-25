/** Instagram GraphQL id is a scoped graph ID; pk is the canonical user ID. */
const numeric=v=>typeof v==='string'&&/^\d+$/.test(v)?v:Number.isSafeInteger(v)&&v>=0?String(v):null;
export function instagramProfileIdentity(roots,username){
 const candidates=new Map();const expected=String(username||'').toLowerCase();
 function visit(v,depth=0){
  if(!v||typeof v!=='object'||depth>70)return;
  if(typeof v.username==='string'&&v.username.toLowerCase()===expected){
   const pk=numeric(v.pk),scoped=numeric(v.id);
   if(pk){const prior=candidates.get(pk);candidates.set(pk,{id:pk,username:v.username,name:v.full_name||prior?.name||null,webScopedId:scoped&&scoped!==pk?scoped:prior?.webScopedId||null,evidence:'matched_instagram_username.pk'});}
  }
  for(const x of Object.values(v))if(x&&typeof x==='object')visit(x,depth+1);
 }
 for(const root of roots)visit(root);
 if(candidates.size>1)return{verified:false,reason:'INSTAGRAM_PROFILE_ID_CONFLICT'};
 if(!candidates.size)return{verified:false,reason:'INSTAGRAM_CANONICAL_USER_ID_UNVERIFIED'};
 return{...candidates.values().next().value,verified:true};
}
export function bindInstagramSourcePost(post,identity){
 if(!post)return null;
 const a=post.author||{};
 if(!identity?.verified)return{...post,author:{...a,id:null,webScopedId:a.id||null}};
 if(a.username?.toLowerCase()!==identity.username.toLowerCase())return null;
 if(a.id&&a.id!==identity.id&&a.id!==identity.webScopedId)return null;
 return{...post,author:{...a,id:identity.id,...(identity.webScopedId?{webScopedId:identity.webScopedId}:{})}};
}
