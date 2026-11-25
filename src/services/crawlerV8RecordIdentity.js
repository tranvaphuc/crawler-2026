import {normalizeFacebookPostInput} from './facebookShare.js';

export const recordText=value=>String(value??'').normalize('NFC').replace(/\r\n/g,'\n').trim();
export const sameDate=(a,b)=>Number.isFinite(Date.parse(a))&&Date.parse(a)===Date.parse(b);
export const numericUid=value=>typeof value==='string'&&/^[1-9]\d*$/.test(value);
export const sameNativeScalar=(actual,expected)=>actual===expected||Number.isSafeInteger(actual)&&actual>=0&&String(actual)===expected;

// A permalink's spelling is not its identity. Never compare arbitrary redirects,
// a post URL without a comment ID, or two missing native IDs as equivalent.
export function commentUrlMatches(document,actualUrl){
 const expected=document._source.url;if(actualUrl===expected&&!/^fb/.test(document._type))return true;
 try{
  const a=new URL(actualUrl),b=new URL(expected);
  if(a.protocol!=='https:'||b.protocol!=='https:'||a.username||a.password||a.port)return false;
  if(/^fb/.test(document._type)){
   const [post,comment]=document._id.split('_'),ap=normalizeFacebookPostInput(actualUrl),bp=normalizeFacebookPostInput(expected),id=u=>u.searchParams.get('reply_comment_id')||u.searchParams.get('comment_id');
   const owner=document._source.parentId?.split('_')[0];
   return /^\d+$/.test(post)&&/^\d+$/.test(comment)&&ap.postId===post&&bp.postId===post&&(!ap.ownerId||ap.ownerId===owner)&&(!bp.ownerId||bp.ownerId===owner)&&id(a)===comment&&id(b)===comment;
  }
  if(document._type==='snsComment')return /^(?:www\.)?instagram\.com$/.test(a.hostname)&&/^(?:www\.)?instagram\.com$/.test(b.hostname)&&a.pathname.replace(/\/$/,'')===b.pathname.replace(/\/$/,'')&&a.hash===b.hash&&a.hash==='#'+document.nativeId;
  if(document._type==='youtubeComment')return /^(?:www\.)?youtube\.com$/.test(a.hostname)&&a.pathname==='/watch'&&a.searchParams.get('v')===b.searchParams.get('v')&&a.searchParams.get('lc')===document._id&&b.searchParams.get('lc')===document._id;
  if(document._type==='threadsComment')return /^(?:www\.)?threads\.(?:net|com)$/.test(a.hostname)&&/^(?:www\.)?threads\.(?:net|com)$/.test(b.hostname)&&a.pathname.replace(/\/$/,'')===b.pathname.replace(/\/$/,'');
 }catch{}
 return false;
}

export function verifyStoredComment(d,hits){
 const e=d.document,found=hits.filter(h=>h._type===e._type&&h._id===e._id);
 if(!found.length)return{pass:false,reason:'COMMENT_ES5_NOT_VISIBLE'};
 if(found.length!==1)return{pass:false,reason:'COMMENT_ES5_ID_NOT_UNIQUE'};
 const h=found[0],a=h._source;if(!a||h._index!==e._index)return{pass:false,reason:'COMMENT_ES5_IDENTITY_CONFLICT'};
 if(['siteId','parentId'].some(k=>a[k]!==e._source[k])||['publishedDate','parentDate'].some(k=>!sameDate(a[k],e._source[k])))return{pass:false,reason:'COMMENT_ES5_PARENT_DATE_CONFLICT'};
 if(e._source.commentParentId!=null&&a.commentParentId!==e._source.commentParentId)return{pass:false,reason:'COMMENT_ES5_REPLY_PARENT_CONFLICT'};
 if((/^fb/.test(e._type)&&!numericUid(a.authorId))||a.authorId!==e._source.authorId)return{pass:false,reason:'COMMENT_ES5_AUTHOR_UNVERIFIED'};
 if(['content','author'].some(k=>recordText(a[k])!==recordText(e._source[k])))return{pass:false,reason:'COMMENT_ES5_CONTENT_CONFLICT'};
 if(!commentUrlMatches(e,a.url))return{pass:false,reason:'COMMENT_ES5_URL_CONFLICT'};
 if(d.state==='indexed'&&(a.ds?.source!==`crawler-v8-${d.platform}-comment`||a.ds?.ip!=='25.10.20.26'))return{pass:false,reason:'COMMENT_ES5_PROVENANCE_CONFLICT'};
 return{pass:true};
}
