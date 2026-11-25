// A user timeline can contain posts tagging that user. The buzz belongs to its
// native author; the inventory source is retained only as discovery provenance.
export function bindFacebookUserPost(item,source){
 if(source?.platform!=='facebook'||!['user','page'].includes(source.type)||item?.type!=='post'||!/^\d+$/.test(item.author?.id||'')||item.author.id===source.nativeId||item.author.id===source.identityProof?.profileId)return {item,source};
 const id=item.author.id,postId=String(item.postId||'');if(!/^\d+$/.test(postId))return {item,source};
 const name=item.author.name||item.author.username||'',discoveredFromSourceId=source.discoveredFromSourceId||source._id;
 const actualSource={...source,_id:'facebook:'+source.type+':'+id,nativeId:id,name,url:'https://www.facebook.com/'+id,canonicalSourceId:null,discoveredFromSourceId,identityStatus:'verified',identityProof:{nativeId:id,type:source.type,profileId:id,evidence:'response.numeric_post_author_in_'+source.type+'_feed',checkedAt:new Date().toISOString()}};
 const actualItem={...item,id:id+'_'+postId,systemId:id+'_'+postId,sourceId:id,url:'https://www.facebook.com/'+id+'_'+postId,discoveredFromSourceId,author:{...item.author,id,name}};
 return {item:actualItem,source:actualSource};
}
