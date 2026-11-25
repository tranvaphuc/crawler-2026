export const AUTHOR_READY_INDEX={name:'author_ready_created',key:{runId:1,createdAt:1,nextAt:1},partialFilterExpression:{state:{$in:['pending','retry']}}};
export function claimPublicAuthorTask(collection,{runId,owner,at=new Date()}){
 return collection.findOneAndUpdate({runId,state:{$in:['pending','retry']},nextAt:{$lte:at}},{$set:{state:'running',owner,leasedUntil:new Date(+at+1800000)}},{returnDocument:'after',sort:{createdAt:1},hint:AUTHOR_READY_INDEX.name});
}
