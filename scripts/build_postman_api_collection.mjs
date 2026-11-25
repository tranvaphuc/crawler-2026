import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const out=path.resolve('outputs/postman-crawler-2026-10-23');await fs.mkdir(out,{recursive:true});
const defaults={
 AUTHEN_KEY_FOR_DOMAIN:'',
 facebook_base_url:'http://127.0.0.1:3804',social_base_url:'http://127.0.0.1:3805',
 facebook_share_id:'61588342686925_122131613781278089',
 facebook_share_url:'https://www.facebook.com/permalink.php?story_fbid=pfbid02s74gb4fpAZtZqDvFj77zdhdrRbSrCHLcbudYgUdhpHmff9XLoS7cgJLdaUp5gbmhl&id=61588342686925',
 facebook_original_id:'1000419343151470_122138942931244237',
 facebook_original_url:'https://www.facebook.com/1000419343151470_122138942931244237',
 facebook_source_id:'1000419343151470',facebook_source_name:'Shopee',
 threads_source_url:'https://www.threads.com/@hapas.vn',instagram_source_url:'https://www.instagram.com/hapas.vn/',youtube_source_url:'https://www.youtube.com/@vtv24',
 threads_post_url:'https://www.threads.com/@dthh___n/post/DSl1YphAcpY',instagram_post_url:'https://www.instagram.com/p/CciJju6P5In/',youtube_post_url:'https://www.youtube.com/watch?v=wlQndvtII1M',
 source_limit:'20',comment_limit:'30',keyword:'HAPAS',keywords_json:'["HAPAS","VTV24"]'
};
const descriptions={facebook_base_url:'Facebook share/details dùng HTTP anonymous qua proxy, không mở Chrome.',social_base_url:'Social API gọi HTTP anonymous qua proxy, không mở Chrome.',source_limit:'Số bài tối đa 1..100. Mặc định 20.',comment_limit:'Tổng comment + reply tối đa 1..100.',keyword:'Keyword đơn dài 1..200 ký tự.',keywords_json:'Chuỗi JSON array 1..10 keyword; đặt trực tiếp vào body, không bọc thêm dấu nháy.'};
const pre=String.raw`
(function () {
  function stop(message) {
    console.warn(message);
    if (pm.execution && typeof pm.execution.skipRequest === 'function') pm.execution.skipRequest();
    else throw new Error(message + ' — hãy dùng Postman Desktop có hỗ trợ skipRequest.');
  }
  const until = Number(pm.collectionVariables.get('cooldown_' + cfg.platform) || 0);
  if (!cfg.negative && until > Date.now()) return stop('Đang cooldown ' + cfg.platform + '; thử lại sau ' + new Date(until).toISOString());
  if (cfg.cursorKey && !cfg.next) {
    for (const suffix of ['', '_bound', '_at', '_seen']) pm.collectionVariables.unset(cfg.cursorKey + suffix);
  }
  if (cfg.next) {
    const cursor = pm.collectionVariables.get(cfg.cursorKey);
    if (!cursor) return stop('Chưa có cursor tiếp theo. Chạy request FIRST tương ứng; không gửi lại trang đầu thay thế.');
    if (Date.now() - Number(pm.collectionVariables.get(cfg.cursorKey + '_at') || 0) >= 30 * 60 * 1000) return stop('Cursor đã quá 30 phút. Chạy FIRST lại.');
    pm.variables.set(cfg.cursorKey, cursor);
  }
  const raw = pm.variables.replaceIn(pm.request.body.raw);
  if (/\{\{[^{}]+\}\}/.test(raw)) return stop('Body còn biến chưa được điền. Kiểm tra environment và collection Variables.');
  let body; try { body = JSON.parse(raw); } catch (_) { return stop('Body không phải JSON hợp lệ sau khi thay biến. Kiểm tra keyword/keywords_json và limit.'); }
  const endpoint = pm.variables.replaceIn(pm.request.url.toString());
  if (/\{\{[^{}]+\}\}/.test(endpoint)) return stop('Base URL chưa được điền.');
  const bound = {operation:cfg.operation, platform:cfg.platform, url:body.url || null, link:body.link || null, keyword:body.keyword || null,
    includeReplies:body.includeReplies !== false, order:body.order || (cfg.operation === 'comments' ? 'oldest' : ['source','search'].includes(cfg.operation) ? 'latest' : null), limit:body.limit || (cfg.operation === 'comments' ? 50 : 20)};
  const fingerprint = JSON.stringify(bound);
  if (cfg.next && fingerprint !== pm.collectionVariables.get(cfg.cursorKey + '_bound')) return stop('URL/keyword/order/includeReplies/limit đã đổi. Chạy FIRST tương ứng để lấy cursor mới.');
  pm.variables.set('__crawler_fingerprint', fingerprint);
})();
`;
const post=String.raw`
(function () {
  function check(name, ok) { pm.test(name, function () { if (!ok) throw new Error(name); }); }
  check('HTTP đúng kỳ vọng ' + cfg.http, pm.response.code === cfg.http);
  let d; try { d = pm.response.json(); check('Response là JSON', d && typeof d === 'object'); }
  catch (_) { check('Response là JSON', false); return; }
  if (cfg.negative) { check('Input sai bị từ chối rõ ràng', !!(d.error || d.reason)); return; }
  pm.collectionVariables.set('last_' + cfg.platform + '_status', d.status || d.error || 'unknown');
  pm.collectionVariables.set('last_' + cfg.platform + '_reason', d.reason || d.error || '');
  const values = Array.isArray(d.results) ? d.results : [d];
  const blocked = values.find(x => ['rate_limited','proxy_error','auth_required','security_checkpoint','busy','error'].includes(x.status) || ['RATE_LIMITED','AUTH_OR_SECURITY_REQUIRED','LOGIN_REQUIRED_FOR_MORE_DATA'].includes(x.reason) || /^PROXY_/.test(x.reason || ''));
  if (blocked || pm.response.code === 503) {
    const value = blocked || d;
    let wait = Number(value.retryAfterMs || 0);
    const header = value.retryAfter || pm.response.headers.get('Retry-After');
    if (!wait && header) wait = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
    if (!wait && (value.status === 'rate_limited' || value.reason === 'RATE_LIMITED')) wait = 15 * 60 * 1000;
    if (Number.isFinite(wait) && wait > 0) pm.collectionVariables.set('cooldown_' + cfg.platform, String(Date.now() + wait));
    console.warn('Dừng vì ' + value.status + ': ' + (value.reason || value.error || '') + '; không tự retry hoặc chuyển proxy.');
    if (pm.execution && typeof pm.execution.setNextRequest === 'function') pm.execution.setNextRequest(null);
  }
  function business(x) {
    if (cfg.latest && x.status === 'sort_unavailable') {
      check('GIỚI HẠN HIỆN TẠI: latest chưa xác minh, không fallback relevance', x.reason === 'LATEST_SORT_UNVERIFIED' && Array.isArray(x.items) && x.items.length === 0 && x.ordering && x.ordering.verified === false);
      console.warn('sort_unavailable là giới hạn đã biết, KHÔNG phải newest search thành công.');
      return false;
    }
    const good = ['ok','partial','resolved'].includes(x.status);
    check('Đọc được dữ liệu nghiệp vụ — status ' + (x.status || 'missing'), good);
    if (!good) return false;
    if (cfg.operation === 'metrics') {
      check('Metrics có danh tính bài đã xác minh', x.identityVerified === true);
      const keys = ['reactions','shares','comment','views','saved','reshares','repost','likes','quotes'];
      check('Đủ các metric và chỉ có integer không âm hoặc null', !!x.metrics && keys.every(k => Object.prototype.hasOwnProperty.call(x.metrics,k) && (x.metrics[k] === null || (Number.isSafeInteger(x.metrics[k]) && x.metrics[k] >= 0))));
      check('Có ít nhất một chỉ số công khai', !!x.metrics && keys.some(k => x.metrics[k] !== null));
    }
    if (['source','comments','search'].includes(cfg.operation)) {
      check('Items là array và count khớp', Array.isArray(x.items) && x.count === x.items.length);
      if (!Array.isArray(x.items)) return false;
      if (x.phase === 'collecting') {
        check('Đang gom trang để sort oldest; chưa phải kết quả rỗng', x.reason === 'COLLECTION_IN_PROGRESS' && x.count === 0 && Number.isInteger(x.stagedCount) && x.stagedCount >= 0 && !!x.pagination.nextCursor && x.pagination.complete === false);
        console.warn('Chạy NEXT để tiếp tục gom; stagedCount=' + x.stagedCount + '. count=0 chưa có nghĩa bài không có comment.');
      } else check('Sample có record công khai', x.items.length > 0);
      if (cfg.operation === 'source' || cfg.operation === 'comments') {
        check('Ordering đúng yêu cầu', !!x.ordering && x.ordering.requested === (cfg.operation === 'source' ? 'latest' : 'oldest'));
        if (x.phase !== 'collecting' && !x.ordering?.verified) console.warn('THỨ TỰ CHƯA XÁC MINH', x.ordering);
        if (cfg.operation === 'source' && x.ordering?.scope === 'available_window') console.warn('Sort chỉ trong cửa sổ đã lấy; chưa chứng minh mới nhất toàn source.');
        if (cfg.operation === 'comments' && !x.coverage?.complete) console.warn('CHƯA CHỨNG MINH ĐỦ COMMENT', x.coverage);
        check('Không nhận complete khi coverage chưa chứng minh đủ', x.pagination?.complete !== true || x.coverage?.complete === true);
      }
      check('Không trùng native ID trong response', x.items.every(n => typeof n.id === 'string') && new Set(x.items.map(n => n.id)).size === x.items.length);
      check('Danh tính source/post/query được xác minh', x.identityVerified === true);
      if (cfg.operation === 'comments') {
        check('Số comment và reply khớp records', x.rootComments === x.items.filter(n => n.type === 'comment').length && x.replies === x.items.filter(n => n.type === 'reply').length);
        check('Reply có cha hợp lệ và không tự trỏ về mình', x.items.filter(n => n.type === 'reply').every(n => typeof n.parentId === 'string' && n.parentId !== n.id));
        if (cfg.rootsOnly) check('Chỉ comment gốc khi includeReplies false', x.replies === 0);
      }
      if (cfg.operation === 'search') check('Search đúng order đã yêu cầu và tối đa 20', !!x.ordering && x.ordering.requested === (cfg.latest ? 'latest' : 'relevance') && x.ordering.verified === true && x.count <= 20);
    }
    if (cfg.transport === 'http') check('HTTP ẩn danh qua proxy và không mở browser', !!x.transport && x.transport.browserUsed === false && (x.transport.proxyUsed === true || (x.transport.cacheHit === true && x.transport.sourceProxyUsed === true && x.transport.requests === 0)) && x.transport.mode === 'http' && x.transport.anonymous === true);
    return true;
  }
  if (['share','details','es5'].includes(cfg.operation)) check('HTTP qua proxy và không mở browser', !!d.transport && d.transport.mode==='http' && d.transport.browserUsed===false && d.transport.proxyUsed===true);
  if (cfg.operation === 'share' || cfg.operation === 'details') {
    const good = d.ok === true && d.status === 'resolved';
    check('Facebook đọc được primary post', good);
    if (good) {
      check('Có post ID dạng string', !!d.post && typeof d.post.postId === 'string');
      if (cfg.operation === 'share') check('Có kết luận share boolean', typeof d.isShare === 'boolean');
      if (cfg.expectedShare !== undefined) check('Bài mẫu có isShare ' + cfg.expectedShare, d.isShare === cfg.expectedShare);
      if (d.originalPost && d.originalPost.id) pm.collectionVariables.set('detected_original_post_id', d.originalPost.id);
    }
  } else if (cfg.operation === 'es5') {
    check('ES5 là response serialize, không phải xác nhận đã ghi ES', d.format === 'es5' && Array.isArray(d.documents) && Array.isArray(d.rejected));
    check('ES5 sample serialize thành công', d.ok === true && d.documents.length > 0 && d.rejected.length === 0);
  } else if (Array.isArray(d.results)) {
    check('Batch liệt kê keyword chưa chạy', Array.isArray(d.unstartedKeywords));
    check('Batch không bỏ dở keyword', Array.isArray(d.unstartedKeywords) && d.unstartedKeywords.length === 0);
    d.results.forEach(business);
  } else business(d);
  if (cfg.cursorKey && Array.isArray(d.items) && d.pagination) {
    const ids=d.items.map(x=>x.id), before=JSON.parse(pm.collectionVariables.get(cfg.cursorKey+'_seen') || '[]');
    if (cfg.next) check('Trang tiếp không trùng ID đã trả', ids.every(id=>!before.includes(id)));
    pm.collectionVariables.set(cfg.cursorKey, d.pagination.nextCursor || '');
    pm.collectionVariables.set(cfg.cursorKey+'_bound', pm.variables.get('__crawler_fingerprint'));
    pm.collectionVariables.set(cfg.cursorKey+'_at', String(Date.now()));
    pm.collectionVariables.set(cfg.cursorKey+'_seen', JSON.stringify(Array.from(new Set(before.concat(ids))).slice(-5000)));
    if (!d.pagination.nextCursor) console.warn('Không có cursor tiếp theo. Đọc status/reason/hasMore; không tự coi đã lấy toàn bộ.');
    if (cfg.discovered && d.items[0] && d.items[0].url) pm.collectionVariables.set(cfg.discovered, d.items[0].url);
  }
  console.log('Kết quả', {request:pm.info.requestName,status:d.status,reason:d.reason || null,count:d.count,rootComments:d.rootComments,replies:d.replies});
})();
`;
const collection={info:{_postman_id:randomUUID(),name:'Crawler 2026 — Facebook và Social APIs',schema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',description:'6 endpoint HTTP đã triển khai; body mẫu, test và cursor theo từng nền tảng. Gửi từng request hoặc chạy một folder tuần tự. Cả 6 endpoint gọi HTTP anonymous qua proxy; không mở browser khi nhận request. Chrome ẩn danh chỉ phục vụ phân tích request trong lúc phát triển. Latest search mặc định chưa được xác minh và có thể trả sort_unavailable; đây không phải newest search thành công. Không có proxy key/cookie/credential trong collection. Xem README-VI.md trong gói.'},auth:{type:'bearer',bearer:[{key:'token',value:'{{AUTHEN_KEY_FOR_DOMAIN}}',type:'string'}]},variable:Object.entries(defaults).map(([key,value])=>({key,value,type:'string',description:descriptions[key]||'Giá trị mẫu; có thể đổi trong environment.'})),item:[]};
let ordinal=0;const index=[];
function rawBody(body){return JSON.stringify(body,null,2).replace(/"__RAW:([^"\n]+)"/g,(_,v)=>v);}
function event(listen,code){return{listen,script:{type:'text/javascript',exec:code.trim().split('\n')}};}
function folder(name,description){const f={name,description,item:[]};collection.item.push(f);return f;}
function request(f,name,endpoint,body,config={},description=''){
 const cfg={http:200,platform:'facebook',transport:'http',...config};
 const base=endpoint.startsWith('/api/facebook/')?'facebook_base_url':'social_base_url';
 const req={id:randomUUID(),name,request:{method:'POST',header:[{key:'Content-Type',value:'application/json',type:'text'},{key:'Accept',value:'application/json',type:'text'}],body:{mode:'raw',raw:rawBody(body),options:{raw:{language:'json'}}},url:`{{${base}}}${endpoint}`,description:description+'\n\n'+(cfg.negative?'Request input sai có chủ ý, kỳ vọng HTTP 400.':cfg.latest?'Latest phải được server xác minh; sort_unavailable là giới hạn hiện tại, không tự đổi sang relevance.':'API gọi HTTP anonymous qua proxy; không mở browser. Không cấu hình proxy credentials trong Postman.')},event:[event('prerequest','(function () {\nconst cfg = '+JSON.stringify(cfg)+';\n'+pre+'\n})();'),event('test','(function () {\nconst cfg = '+JSON.stringify(cfg)+';\n'+post+'\n})();')],response:[]};
 f.item.push(req);index.push({number:++ordinal,folder:f.name,name,endpoint,operation:cfg.operation,platform:cfg.platform,config:cfg});return req;
}
async function example(req,file,label){
 const entry=index.find(x=>x.name===req.name), fresh=entry?path.resolve('outputs/http-api-transport-2026-10-23',entry.platform+'-'+entry.operation+'.json'):null;
 const p=fresh&&await fs.access(fresh).then(()=>true,()=>false)?fresh:path.resolve(file);let value;try{value=JSON.parse(await fs.readFile(p,'utf8'));}catch{return;}
 if(value.pagination)value.pagination.nextCursor=null;
 req.response.push({name:label+' — snapshot cũ, cursor hết hạn đã bỏ',originalRequest:structuredClone(req.request),status:'OK',code:200,_postman_previewlanguage:'json',header:[{key:'Content-Type',value:'application/json'}],cookie:[],body:JSON.stringify(value,null,2)});
}
const share=folder('01 Facebook — kiểm tra share','Dịch vụ 3804. ID ghép hoặc URL bài. Có request bài share và bài gốc.');
request(share,'01 Share — nhập ID ghép','/api/facebook/post/share',{id:'{{facebook_share_id}}'},{operation:'share',expectedShare:true},'Sample đã xác định là share. Response có originalPost khi đủ bằng chứng.');
request(share,'02 Share — nhập permalink URL','/api/facebook/post/share',{url:'{{facebook_share_url}}'},{operation:'share',expectedShare:true});
request(share,'03 Bài gốc — kiểm tra không phải share','/api/facebook/post/share',{id:'{{facebook_original_id}}'},{operation:'share',expectedShare:false});
const details=folder('02 Facebook — details và ES5','Thông tin bài công khai; format es5 chỉ serialize, không tự ghi Elasticsearch.');
request(details,'01 Details — nhập ID ghép','/api/facebook/post/details',{id:'{{facebook_original_id}}'},{operation:'details'});
request(details,'02 Details — nhập URL','/api/facebook/post/details',{url:'{{facebook_original_url}}'},{operation:'details'});
request(details,'03 Details — format ES5 cho Page','/api/facebook/post/details',{id:'{{facebook_original_id}}',format:'es5',source:{type:'page',id:'{{facebook_source_id}}',name:'{{facebook_source_name}}'}},{operation:'es5'});
const metrics=folder('03 Metrics — 4 nền tảng','Giữ null khi không có counter công khai. Không cộng reactions và likes hay các loại repost/quote với nhau.');
for(const platform of ['facebook','threads','instagram','youtube']){
 const url=platform==='facebook'?'{{facebook_original_url}}':`{{${platform}_post_url}}`;
 const body={link:url,url,...(platform==='instagram'?{type:'snsTopic'}:{platform})};
 const req=request(metrics,platform+' — chỉ số tương tác','/api/social/post/metrics',body,{operation:'metrics',platform,transport:'http'});
 await example(req,`outputs/social-metrics-api-2026-10-23/${platform}-live.json`,'Metrics '+platform);
}
const sources=folder('04 Source posts — FIRST và NEXT','Chạy FIRST để lấy/lưu cursor, rồi NEXT cùng nền tảng. NEXT không gửi khi không có cursor, hết hạn hoặc input thay đổi.');
for(const platform of ['threads','instagram','youtube']){
 const cursorKey=`cursor_${platform}_source`,base={url:`{{${platform}_source_url}}`,order:'latest',limit:'__RAW:{{source_limit}}'};
 const req=request(sources,platform+' — FIRST lấy bài từ source','/api/social/source/posts',base,{operation:'source',platform,transport:'http',cursorKey,discovered:`${platform}_discovered_post_url`});
 await example(req,`outputs/social-content-api-2026-10-23/${platform}-source-live.json`,'Source '+platform);
 request(sources,platform+' — NEXT trang bài tiếp theo','/api/social/source/posts',{...base,cursor:`{{${cursorKey}}}`},{operation:'source',platform,transport:'http',cursorKey,next:true});
}
const comments=folder('05 Comments và replies — 3 nền tảng','Limit là tổng comment+reply. FIRST mặc định includeReplies true; request ROOTS ONLY có state riêng để không làm hỏng cursor của FIRST/NEXT.');
for(const platform of ['threads','instagram','youtube']){
 const cursorKey=`cursor_${platform}_comments`,base={url:`{{${platform}_post_url}}`,order:'oldest',limit:'__RAW:{{comment_limit}}',includeReplies:true};
 const req=request(comments,platform+' — FIRST comment và reply','/api/social/post/comments',base,{operation:'comments',platform,transport:'http',cursorKey});
 await example(req,`outputs/social-content-api-2026-10-23/${platform}-comments-live.json`,'Comments '+platform);
 request(comments,platform+' — NEXT comment và reply','/api/social/post/comments',{...base,cursor:`{{${cursorKey}}}`},{operation:'comments',platform,transport:'http',cursorKey,next:true});
 request(comments,platform+' — ROOTS ONLY không lấy reply','/api/social/post/comments',{...base,includeReplies:false},{operation:'comments',platform,transport:'http',rootsOnly:true,cursorKey:`cursor_${platform}_roots_only`});
}
const search=folder('06 Search — keyword và batch','20 kết quả tối đa mỗi keyword. Latest là mặc định nhưng đang bị giới hạn ở phản hồi ẩn danh; relevance là lựa chọn rõ ràng khác.');
for(const platform of ['threads','youtube']){
 request(search,platform+' — LATEST yêu cầu 20 bài mới nhất','/api/social/search',{platform,keyword:'{{keyword}}',order:'latest',limit:20},{operation:'search',platform,transport:'http',latest:true,cursorKey:`cursor_${platform}_search_latest`});
 const cursorKey=`cursor_${platform}_search_relevance`,base={platform,keyword:'{{keyword}}',order:'relevance',limit:20};
 const req=request(search,platform+' — RELEVANCE FIRST 20 kết quả','/api/social/search',base,{operation:'search',platform,transport:'http',cursorKey});
 await example(req,`outputs/social-content-api-2026-10-23/${platform}-search-relevance-live.json`,'Search relevance '+platform);
 request(search,platform+' — RELEVANCE NEXT','/api/social/search',{...base,cursor:`{{${cursorKey}}}`},{operation:'search',platform,transport:'http',cursorKey,next:true});
 request(search,platform+' — BATCH 20 kết quả mỗi keyword','/api/social/search',{platform,keywords:'__RAW:{{keywords_json}}',order:'relevance',limit:20},{operation:'search',platform,transport:'http'});
}
const invalid=folder('07 Negative tests — input sai có chủ ý','Chỉ kiểm tra validation, không cần cấp proxy hoặc mở browser. Mỗi request kỳ vọng HTTP 400.');
request(invalid,'01 Facebook — gửi id và url cùng lúc','/api/facebook/post/share',{id:'{{facebook_share_id}}',url:'{{facebook_share_url}}'},{operation:'negative',negative:true,http:400});
request(invalid,'02 Facebook — ID là number thay vì string','/api/facebook/post/details',{id:123456},{operation:'negative',negative:true,http:400});
request(invalid,'03 Metrics — localhost không phải post URL','/api/social/post/metrics',{url:'http://127.0.0.1/private'},{operation:'negative',negative:true,http:400,platform:'facebook'});
request(invalid,'04 Source — truyền link bài thay vì source','/api/social/source/posts',{url:'{{instagram_post_url}}'},{operation:'negative',negative:true,http:400,platform:'instagram'});
request(invalid,'05 Comments — limit vượt 20000','/api/social/post/comments',{url:'{{youtube_post_url}}',limit:20001},{operation:'negative',negative:true,http:400,platform:'youtube'});
request(invalid,'06 Search — Instagram chưa hỗ trợ keyword','/api/social/search',{platform:'instagram',keyword:'{{keyword}}'},{operation:'negative',negative:true,http:400,platform:'instagram'});
const env={id:randomUUID(),name:'Crawler 2026 — Local 3804 và 3805',values:Object.entries(defaults).map(([key,value])=>({key,value,type:'default',enabled:true})),_postman_variable_scope:'environment',_postman_exported_at:new Date().toISOString(),_postman_exported_using:'crawler-2026 collection builder'};
await fs.writeFile(path.join(out,'Crawler-2026.postman_collection.json'),JSON.stringify(collection,null,2));
await fs.writeFile(path.join(out,'Crawler-2026-Local.postman_environment.json'),JSON.stringify(env,null,2));
await fs.writeFile(path.join(out,'request-index.json'),JSON.stringify(index.map(({config,...x})=>x),null,2));
await fs.writeFile(path.join(out,'README-VI.md'),`# Bộ request Postman Crawler 2026

Ngày tạo: 23/10/2026 (giờ Việt Nam). ${ordinal} request, 7 folder, 6 endpoint HTTP. Collection v2.1. Không chứa key proxy, cookie, token đăng nhập hoặc mật khẩu.

## Import và gọi thử

1. Giải nén ZIP, trong Postman chọn **Import → Files** và chọn cả hai file JSON có đuôi postman_collection.json và postman_environment.json. Không import request-index.json như collection.
2. Chọn environment **Crawler 2026 — Local 3804 và 3805** ở góc phải. Collection cũng có giá trị mặc định nên vẫn đọc được cấu hình khi chưa chọn environment.
3. Trên máy chạy server, tại /Users/phuctran/Workspace/crawler-2026 chạy hai terminal riêng:
   - npm run api:facebook-share (cổng 3804)
   - npm run api:social (cổng 3805; không chạy thêm api:social-metrics cùng cổng)
4. Nếu Postman ở máy khác, đổi facebook_base_url và social_base_url sang địa chỉ reverse proxy/server của bạn. API mặc định chỉ bind 127.0.0.1; file environment không tự cấu hình networking hoặc xác thực từ xa.
5. Mở folder và request muốn thử, xem Body rồi nhấn **Send**. Header Content-Type và toàn bộ body mẫu đã có sẵn. Không phải điền proxy credentials vào Postman; server Social tự cấp proxy.
6. Xem **Body**, **Test Results** và Postman Console. Test nghiệp vụ sẽ fail nếu HTTP 200 nhưng proxy/auth/data chưa đạt; không chỉ kiểm tra HTTP code. Folder Negative tests cố ý gửi sai input và pass khi server trả 400.

Nếu dùng Postman web để gọi localhost, cần Desktop Agent. Với bản Desktop, gọi trực tiếp được khi hai server đang chạy. Đặt request timeout ít nhất 120 giây cho từng request; batch keyword có thể cần lâu hơn. Ưu tiên Send từng request hoặc chạy một folder tuần tự, một iteration; không chạy đồng thời nhiều folder, không loop cả collection.

## Các folder

${collection.item.map(f=>'- **'+f.name+'**: '+f.item.length+' request. '+f.description).join('\n')}

## Biến cần đổi

- facebook_base_url / social_base_url: hai dịch vụ khác nhau, không dùng chung nhầm port.
- facebook_share_id / facebook_share_url: mẫu bài share; nếu thay bài, các test expected isShare của request mẫu có thể cần đổi theo kỳ vọng mới.
- facebook_original_id / facebook_original_url, facebook_source_id / facebook_source_name: bài gốc và source cho format ES5. Phải giữ cùng danh tính.
- threads_source_url / instagram_source_url / youtube_source_url: URL profile/channel.
- threads_post_url / instagram_post_url / youtube_post_url: URL post/video cụ thể.
- source_limit: integer 1..100. comment_limit: integer 1..100, tính cả comment và reply.
- keyword: keyword đơn. keywords_json: một chuỗi JSON array hợp lệ, ví dụ ["HAPAS","VTV24"]. Không bọc thêm nháy quanh placeholder của array trong body.

Body dùng biến chuẩn Postman. Nếu keyword chứa dấu nháy hoặc ký tự escape, chỉnh Body để vẫn là JSON hợp lệ. Pre-request kiểm tra JSON sau thay biến, không tự gửi body lỗi.

## Cursor và dữ liệu nối tiếp

FIRST xóa state cursor cũ của đúng luồng rồi lưu nextCursor sau response. NEXT lấy cursor vừa lưu; tự skip nếu chưa có cursor, quá 30 phút hoặc URL/keyword/order/includeReplies/limit đã đổi. Khi API server restart, cursor cũ mất ở server; chạy lại FIRST. Không nhập cursor từ saved Example: token ở các ví dụ cũ đã được bỏ.

Source mặc định order=latest; comment mặc định order=oldest, includeReplies=true. YouTube có thể trả phase=collecting, count=0 và stagedCount tăng: chạy NEXT đến phase=delivering. Đây không phải kết luận không có comment. Đọc ordering.verified/scope và coverage; cảnh báo trong Console không phải xác nhận đầy đủ hay sort thành công.

Cursor dùng collection variables riêng cho từng nền tảng và luồng, không ghi đè sample URL trong environment. NEXT kiểm tra không trùng các ID đã nhận. ROOTS ONLY có state riêng. Không có vòng lặp tự động lấy toàn bộ dữ liệu. Giữ nguyên limit khi gọi NEXT. Trang buffer có cacheHit=true, sourceProxyUsed=true, requests=0; không gọi lại upstream. Không có cursor tiếp theo không tự chứng minh đã lấy hết; đọc status, reason, hasMore và complete.

Source FIRST còn lưu threads_discovered_post_url / instagram_discovered_post_url / youtube_discovered_post_url trong collection variables. Có thể lấy URL đó thay cho biến *_post_url để thử metrics/comment với bài mới tìm được. Collection không tự mở thêm request sau Send.

## Cooldown và lỗi

Post-response lưu last_<platform>_status và last_<platform>_reason. Nếu có retryAfterMs hoặc Retry-After, lưu cooldown_<platform> và skip request cần proxy trên nền tảng đó tới khi hết hạn. Khi gặp auth/security/rate/proxy/busy/error, Collection Runner dừng iteration; Send thủ công không tự gọi lại. Không tự thay key, không login, không vượt checkpoint. Negative tests vẫn chạy vì chỉ kiểm tra input trước khi cấp proxy.

Test đỏ khi source không trả dữ liệu hoặc counter bị ẩn có thể phản ánh giới hạn hiện tại của nền tảng, không nhất thiết lỗi import. Đọc response thật; đừng đổi null thành 0. Lỗi ECONNREFUSED nghĩa là server/base URL chưa sẵn sàng, không phải kết luận nền tảng die.

## Giới hạn quan trọng

- Cả 6 endpoint 3804/3805 gọi HTTP anonymous qua proxy. Browser chỉ được dùng để phân tích request trong lúc phát triển.
- Social API có giới hạn đồng thời ở router; pool Instagram/YouTube chỉ có 1 key mỗi nền tảng. Runtime không phụ thuộc Chrome.
- Search **latest** hiện có thể trả sort_unavailable / LATEST_SORT_UNVERIFIED. Test ghi rõ giới hạn này; test xanh ở nhánh đó không có nghĩa đã lấy 20 bài mới nhất. RELEVANCE chỉ chạy khi body chọn rõ order=relevance.
- count là số tối đa; có thể ít hơn limit do public window, thiếu quyền, dedup hoặc số dữ liệu thật. Không hứa đủ toàn bộ comment/reply.
- Format ES5 chỉ serialize response; không tự ghi Elasticsearch. Các luồng Facebook source/comment hiện là hàm JS, chưa có endpoint HTTP nên không có request giả cho chúng.

## Examples và kiểm chứng bộ import

Một số request có **Examples** là kết quả thật đã lưu trước đó, không phải response hiện tại hay cam kết counter cố định. Token cursor cũ được bỏ khỏi example. Tests không so sánh counter với số cố định trong Examples.

Bộ tạo và validator nằm ở scripts/build_postman_api_collection.mjs và scripts/validate_postman_api_collection.mjs. Kiểm tra JSON schema v2.1, biến/body, input qua normalizer thật và scripts trong sandbox mô phỏng. Việc xác minh bundle không tự gửi hàng chục request tới nền tảng hoặc chạy crawler.

Tài liệu Postman tham chiếu: [Collection v2.1](https://learning.postman.com/api-docs/api-reference/collections/create-collection), [Variables](https://learning.postman.com/docs/use/send-requests/variables/environment-variables), [skipRequest](https://learning.postman.com/v11/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-execution).
`);
console.log(JSON.stringify({out,folders:collection.item.length,requests:ordinal,endpoints:[...new Set(index.map(x=>x.endpoint))].length}));

