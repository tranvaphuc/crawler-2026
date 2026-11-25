import test from 'node:test';import assert from 'node:assert/strict';
import {youtubeJsonPostMetadata} from '../src/services/youtubeJsonMetadata.js';
import {extractPostInfo} from '../src/services/socialPostInfo.js';
import {normalizeContentInput} from '../src/services/socialContent.js';
import {createSocialHttpContentReader} from '../src/services/socialHttpReaders.js';
import {READ_STATE} from '../src/services/socialReadState.js';
const id='abcdefghijk',date='2026-10-30T00:00:00Z',context={client:{clientName:'WEB',clientVersion:'native-version'}},target={platform:'youtube',id,url:'https://www.youtube.com/watch?v='+id};
const player=(extra={})=>({playabilityStatus:{status:'UNPLAYABLE'},videoDetails:{videoId:id,channelId:'UCsource',title:'Public title',viewCount:'42'},microformat:{playerMicroformatRenderer:{publishDate:date}},...extra});
const session=(payload,status=200)=>({request:async()=>({httpStatus:status,html:JSON.stringify(payload),retryAfterMs:70000})});
test('matching public JSON metadata supplies exact dates without requiring video playback or HTML',async()=>{
 const r=await youtubeJsonPostMetadata(session(player()),target,context,{sourceId:'UCsource'});assert.ok(r.snapshot);assert.equal(r.snapshot.html,'');const info=extractPostInfo(target,r.snapshot);assert.equal(info.identityVerified,true);assert.equal(info.post.id,id);assert.equal(info.post.createdAt,'2026-10-30T00:00:00.000Z');assert.equal(info.metrics.views,42);
});
test('login, rate limits and conflicting identities remain failures rather than metadata success',async()=>{
 assert.equal((await youtubeJsonPostMetadata(session(player({playabilityStatus:{status:'LOGIN_REQUIRED'}})),target,context)).failure.status,'auth_required');
 const rate=await youtubeJsonPostMetadata(session({},429),target,context);assert.equal(rate.failure.status,'rate_limited');assert.equal(rate.failure.retryAfterMs,70000);
 assert.equal((await youtubeJsonPostMetadata(session({error:{code:403,message:'LOGIN_REQUIRED'}}),target,context)).failure.status,'auth_required');
 for(const d of [{videoId:'lmnopqrstuv',channelId:'UCsource'},{videoId:id,channelId:'UCother'}])assert.equal((await youtubeJsonPostMetadata(session(player({videoDetails:d})),target,context,{sourceId:'UCsource'})).failure.reason,'YOUTUBE_PLAYER_IDENTITY_MISMATCH');
});
test('a missing date or unsupported payload explicitly falls back to the existing HTML reader',async()=>{
 assert.equal((await youtubeJsonPostMetadata(session({videoDetails:{videoId:id}}),target,context)).unsupported,true);
});
test('source publication hydration makes a JSON player request and never opens the watch HTML',async()=>{
 const state={kind:'youtube',items:[{id,type:'post',url:target.url,createdAt:null}],offset:0,collecting:false,streamMore:false,dateAttempts:new Set(),context,base:{status:'partial',identityVerified:true,pagination:{hasMore:false}},queue:[],seenIds:new Set()},calls=[];
 const read=createSocialHttpContentReader({preferYoutubePlayerMetadata:true,requireSourcePublicationTime:true,maxPages:1,respectPlatformCooldown:false,getProxy:async()=>({server:'http://proxy.test:8888'}),makeSession:()=>({requests:0,close(){},async request(url,opts){this.requests++;calls.push(url);assert.equal(url,'https://www.youtube.com/youtubei/v1/player');assert.equal(opts.body.videoId,id);return{httpStatus:200,html:JSON.stringify(player())};}})});
 const r=await read({...normalizeContentInput('source',{url:'https://www.youtube.com/@sample',reference:{id:'UCsource'},limit:100}),[READ_STATE]:state});assert.equal(r.items[0].createdAt,'2026-10-30T00:00:00.000Z');assert.equal(calls.length,1);
});
