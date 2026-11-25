import test from 'node:test';import assert from 'node:assert/strict';
import {verifiedExistingFacebookAuthor} from '../src/services/facebookAuthorResolution.js';
import {serializeCrawlItem} from '../src/services/crawlerV8Es5.js';
const source={platform:'facebook',type:'page',nativeId:'12',name:'Page'},parent={nativeId:'34',systemId:'12_34',createdAt:'2026-10-26T01:00:00.000Z'},item={id:'56',postId:'34',type:'comment',createdAt:'2026-10-26T02:00:00.000Z',text:'Exact content',author:{name:'Native name'}};
const canonical=()=>({found:true,...serializeCrawlItem({...item,author:{...item.author,id:'789'}},source,{parent})});
test('recovers a numeric ID only from the same canonical ES5 comment',()=>{assert.equal(verifiedExistingFacebookAuthor(item,source,parent,canonical()).id,'789');});
test('rejects any mismatched identity, parent, content, date, author or URL',()=>{
 for(const key of ['_index','_type','_id']){const hit=canonical();hit[key]+='other';assert.equal(verifiedExistingFacebookAuthor(item,source,parent,hit),null,key);}
 for(const key of ['siteId','publishedDate','author','content','parentId','parentDate','url','commentParentId']){const hit=canonical();hit._source[key]='other';assert.equal(verifiedExistingFacebookAuthor(item,source,parent,hit),null,key);}
 for(const value of ['pfbidOpaque',null,123]){const hit=canonical();hit._source.authorId=value;assert.equal(verifiedExistingFacebookAuthor(item,source,parent,hit),null);}
 assert.equal(verifiedExistingFacebookAuthor(item,source,parent,{...canonical(),found:false}),null);
});
test('accepts equivalent legacy native comment URLs while still proving exact post and comment',()=>{
 for(const url of ['https://www.facebook.com/12/posts/34?comment_id=56','https://www.facebook.com/12/posts/34?comment_id=34_56']){const h=canonical();h._source.url=url;assert.equal(verifiedExistingFacebookAuthor(item,source,parent,h).id,'789');}
 for(const url of ['https://www.facebook.com/99/posts/34?comment_id=56','https://www.facebook.com/12/posts/35?comment_id=56','https://www.facebook.com/12/posts/34?comment_id=57','https://www.facebook.com.evil/12/posts/34?comment_id=56']){const h=canonical();h._source.url=url;assert.equal(verifiedExistingFacebookAuthor(item,source,parent,h),null);}
 const reply={...item,type:'reply',parentId:'55'},h={found:true,...serializeCrawlItem({...reply,author:{...reply.author,id:'789'}},source,{parent})};h._source.url='https://www.facebook.com/12/posts/34?comment_id=56';delete h._source.commentParentId;assert.equal(verifiedExistingFacebookAuthor(reply,source,parent,h).id,'789');
 h._source.commentParentId='34_999';assert.equal(verifiedExistingFacebookAuthor(reply,source,parent,h),null);
});
