import {isDeepStrictEqual} from 'node:util';
// insertedDate and engagement counters belong to the existing stored record.
// Its native editorial payload must match before acknowledging an old create.
const nativeFields=['publishedDate','publishedDatePrecision','authorId','author','siteId','siteName','title','content','description','url','picture','descriptionStatus','nativeMediaUrls','nativeVideoUrl'];
export function categoryImportDecision(doc,hit){
 if(!hit||hit.error||hit._index!==doc._index||hit._type!==doc._type||hit._id!==doc._id)return 'held_for_document_review';
 if(hit.found===false)return 'requeued_after_confirmed_absence';
 if(hit.found!==true)return 'held_for_document_review';
 if(isDeepStrictEqual(hit._source,doc._source))return 'confirmed_exact_existing';
 return nativeFields.every(key=>isDeepStrictEqual(hit._source?.[key],doc._source[key]))?'confirmed_existing_native_fields':'held_for_document_review';
}
