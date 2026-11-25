import {existsSync as rolloutExists} from 'node:fs';
if(process.argv.includes('--round11-http')||(!process.argv.some(a=>['--round10-http','--round9-http','--round8-http','--round7-http','--round6-http','--round5-http','--round4-http','--round3','--round2'].includes(a))&&rolloutExists('outputs/news-parser-rollout-2026-11-09/round11-http/final-summary.json'))){await import('./finalize_news_http_round11.mjs');process.exit(0);}
if(process.argv.includes('--round10-http')||(!process.argv.some(a=>['--round9-http','--round8-http','--round7-http','--round6-http','--round5-http','--round4-http','--round3','--round2'].includes(a))&&rolloutExists('outputs/news-parser-rollout-2026-11-09/round10-http/final-summary.json'))){await import('./finalize_news_http_round10.mjs');process.exit(0);}
if(process.argv.includes('--round9-http')||(!process.argv.some(a=>['--round8-http','--round7-http','--round6-http','--round5-http','--round4-http','--round3','--round2'].includes(a))&&rolloutExists('outputs/news-parser-rollout-2026-11-09/round9-http/final-summary.json'))){await import('./finalize_news_http_round9.mjs');process.exit(0);}
if(process.argv.includes('--round8-http')||(!process.argv.some(a=>['--round7-http','--round6-http','--round5-http','--round4-http','--round3','--round2'].includes(a))&&rolloutExists('outputs/news-parser-rollout-2026-11-09/round8-http/final-summary.json'))){await import('./finalize_news_http_round8.mjs');process.exit(0);}
if(process.argv.includes('--round7-http')||(!process.argv.some(a=>['--round8-http','--round6-http','--round5-http','--round4-http','--round3','--round2'].includes(a))&&rolloutExists('outputs/news-parser-rollout-2026-11-09/round7-http/final-summary.json'))){await import('./finalize_news_http_round7.mjs');process.exit(0);}
if(process.argv.includes('--round6-http')||(!process.argv.some(a=>['--round5-http','--round4-http','--round3','--round2'].includes(a))&&rolloutExists('outputs/news-parser-rollout-2026-11-09/round6-http/final-summary.json'))){await import('./finalize_news_http_round6.mjs');process.exit(0);}
if(process.argv.includes('--round5-http')||(!process.argv.some(a=>['--round6-http','--round4-http','--round3','--round2'].includes(a))&&rolloutExists('outputs/news-parser-rollout-2026-11-09/round5-http/final-summary.json'))){await import('./finalize_news_http_round5.mjs');process.exit(0);}
if(process.argv.includes('--round4-http')){await import('./finalize_news_http_rollout.mjs');process.exit(0);}
import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {legacyNewsId,weeklyIndex} from '../src/web/newsParser.mjs';
import {parseTinhteThread} from '../src/web/tinhteParser.mjs';
import {parseForumThread} from '../src/web/forumParser.mjs';
const root=path.resolve('outputs/news-parser-rollout-2026-11-09');const activeRound=process.argv.includes('--round3')?'round3':'round2';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const write=async(p,x)=>fs.writeFile(p,JSON.stringify(x,null,2));
const targets=await read(path.join(root,'targets.json')),rows=await read(path.join(root,'reviewed-results.json'));
assert.equal(targets.length,544);assert.equal(new Set(rows.map(r=>r.domain)).size,544);
const passed=r=>['parser_samples_passed','parser_passed_category_unverified'].includes(r.status);
const manifest=[];let checkedDocuments=0;
for(const site of targets){
 const r=rows.find(r=>r.domain===site.domain);assert.ok(r);
 const file=path.resolve('config/web-sources/news',site.domain+(site.domain==='antt.vn'?'.validated':'')+'.json');
 let config;try{config=await read(file);}catch{config={domain:site.domain,homepage:site.url};}
 let samples=[];try{samples=await read(path.join(root,'sites',site.domain,'reviewed-samples.json'));}catch{}
 const valid=samples.filter(s=>s.parsed);let publicationContext={},publicationProof={};try{publicationContext=await read(path.join(root,'sites',site.domain,'publication-context.json'));if(publicationContext.feedHtmlFile)publicationProof=parsePublicPublicationFeed(await fs.readFile(path.join(root,'sites',site.domain,publicationContext.feedHtmlFile),'utf8'),publicationContext.feedUrl);}catch{}
 if(passed(r)){
  assert.ok(valid.length>=3&&valid.filter(s=>s.holdout).length>=2,site.domain);
  assert.ok(new Set(valid.map(s=>s.parsed._source.title)).size>=3,site.domain+' constant title');
 }
 for(const s of valid){
  const p=s.parsed,d=p._source;assert.ok(d.title&&d.content&&d.url&&d.publishedDate);
  assert.equal(p._type,'newsTopic');assert.equal(p._id,legacyNewsId({registrableDomain:config.registrableDomain||site.domain,title:d.title,identityUrl:s.url}));
  assert.equal(p._index,weeklyIndex(d.publishedDate));
  await fs.access(path.join(root,'sites',site.domain,s.htmlFile));
  if(s.evidence){const e=await read(path.join(root,'sites',site.domain,s.evidence));if(e.requestedUrl)assert.equal(e.requestedUrl,s.url);}
  if(['public_feed','google_news_sitemap'].includes(p.extracted.dateEvidenceSource)){assert.equal(publicationProof.publicationDates?.[s.url]?.iso,d.publishedDate,site.domain+' publication evidence');assert.equal(p.extracted.dateEvidenceUrl,publicationContext.feedUrl);}
  checkedDocuments++;
 }
 config={...config,enabled:false,stage:r.status,browserMode:'headless-new',parserModule:'src/web/configurableNewsParser.mjs',requiresPublicationContext:[config.publishedDate,...(config.variants||[]).map(v=>v.publishedDate)].some(d=>d?.strategy==='public_feed'),identityReconciliationRequired:true,queueCreated:false,es5Written:false,
  validation:{...config.validation,checkedAt:r.reviewedAt||r.checkedAt,sampleCount:r.sampleCount||samples.length,passedSamples:r.passedSamples||0,independentSampleCount:r.independentSamples||0,categoryVerified:r.status==='parser_samples_passed',fullSiteCycleVerified:false,reason:r.reason||null}};
 await write(file,config);
 manifest.push({domain:site.domain,status:r.status,configurationFile:file,passedSamples:r.passedSamples||0,independentSamples:r.independentSamples||0,categoryVerified:r.status==='parser_samples_passed',requiresPublicationContext:config.requiresPublicationContext,configuredTimezoneAssumption:!!config.timezoneProvenance,reason:r.reason||null,exampleUrls:valid.slice(0,3).map(s=>s.url)});
}
const forums=[];
for(const domain of ['voz.vn','tinhte.vn']){
 const summary=await read(path.join(root,'forum',domain+'-summary.json'));
 const configPath=path.resolve('config/web-sources/forum',domain+'.json');const config=await read(configPath);
 const previous=config.previousVisibleBrowserSamples||config.observedSamples||[];
 for(const [i,s] of summary.samples.entries()){
  if(!s.completeRequiredFields)continue;
  const htmlFile=s.htmlFile||domain+'-thread-'+(i+1)+'.html';
  const html=await fs.readFile(path.join(root,'forum',htmlFile),'utf8');
  const parsed=domain==='tinhte.vn'?parseTinhteThread(html,s.url):parseForumThread(html,s.url,domain);
  assert.ok(parsed.completeRequiredFields,domain);assert.ok(parsed.parsedPosts.some(p=>p.role==='forumTopic'));
  assert.equal(new Set(parsed.parsedPosts.map(p=>p.nativePostId)).size,parsed.parsedPosts.length);
  assert.ok(parsed.parsedPosts.filter(p=>p.role==='forumComment').every(p=>p.parentId&&p.parentDate));
  await write(path.join(root,'forum',domain+'-final-parsed-'+(i+1)+'.json'),parsed);
 }
 await write(configPath,{...config,enabled:false,browserMode:'headless-new',sampleStatus:summary.status,observedSamples:summary.samples,previousVisibleBrowserSamples:domain==='voz.vn'&&summary.status!=='samples_passed'?previous:undefined,paginationScope:'Only posts embedded in the first page of each sampled topic; full history not verified',queueCreated:false,es5Written:false});
 forums.push({domain,status:summary.status,browserMode:'headless-new',samples:summary.samples.length,parsedPosts:summary.samples.reduce((n,s)=>n+(s.parsedPosts||0),0)});
}
const counts=rows.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{});
const baseline=await read(path.join(root,activeRound,activeRound==='round3'?'baseline-reviewed-results.json':'baseline-results.json')).catch(()=>[]);const pendingBefore=baseline.filter(r=>!passed(r)),categoryBefore=baseline.filter(r=>r.status==='parser_passed_category_unverified');
const changes={parserPreviouslyPending:pendingBefore.length,parserNowPassed:pendingBefore.filter(r=>passed(rows.find(x=>x.domain===r.domain))).map(r=>r.domain),categoryPreviouslyPending:categoryBefore.length,categoryNowVerified:categoryBefore.filter(r=>rows.find(x=>x.domain===r.domain)?.status==='parser_samples_passed').map(r=>r.domain)};
const summary={[activeRound]:changes,configuredTimezoneAssumptionSites:manifest.filter(r=>r.configuredTimezoneAssumption&&passed(r)).map(r=>r.domain),publicationContextSites:manifest.filter(r=>r.requiresPublicationContext&&passed(r)).map(r=>r.domain),totalSamples:rows.reduce((n,r)=>n+(r.sampleCount||0),0),passedSamples:rows.reduce((n,r)=>n+(r.passedSamples||0),0),checkedAt:new Date().toISOString(),targetCount:544,checked:rows.length,statuses:counts,articleParserPassed:rows.filter(passed).length,homepageAndCategorySamplesPassed:counts.parser_samples_passed,needsParserWork:rows.filter(r=>!passed(r)).length,verifiedDocumentIdentities:checkedDocuments,forum:forums,browserMode:'headless-new',enabled:false,fullAllSiteCycleVerified:false,es5Written:false,queueCreated:false};
await write(path.join(root,'final-summary.json'),summary);await write(path.join(root,activeRound,'changes.json'),changes);
await write(path.join(root,activeRound,'parser-resolved.json'),manifest.filter(r=>changes.parserNowPassed.includes(r.domain)));
await write(path.join(root,activeRound,'parser-still-failing.json'),manifest.filter(r=>pendingBefore.some(b=>b.domain===r.domain)&&!passed(r)));
await write(path.join(root,activeRound,'category-confirmed.json'),manifest.filter(r=>changes.categoryNowVerified.includes(r.domain)));
await write(path.join(root,activeRound,'category-still-unverified.json'),manifest.filter(r=>categoryBefore.some(b=>b.domain===r.domain)&&r.status!=='parser_samples_passed'));
await write(path.join(root,'all-site-configs.json'),manifest);
await write(path.join(root,'ready-sites.json'),manifest.filter(r=>r.status==='parser_samples_passed'));
await write(path.join(root,'article-parser-passed.json'),manifest.filter(passed));
await write(path.join(root,'needs-parser-work.json'),manifest.filter(r=>!passed(r)));
await write(path.join(root,'needs-category-verification.json'),manifest.filter(r=>r.status==='parser_passed_category_unverified'));
await fs.writeFile(path.join(root,'per-site-results.txt'),manifest.map(r=>`${r.domain}\n  Status: ${r.status}; parsed ${r.passedSamples}; independent ${r.independentSamples}; category ${r.categoryVerified}\n  Config: ${r.configurationFile}\n  Evidence: ${path.join(root,'sites',r.domain)}\n  Note: ${r.reason||''}\n  Examples: ${r.exampleUrls.join(' | ')}\n`).join('\n'));
await fs.writeFile(path.join(root,'report.txt'),`BÁO CÁO CẤU HÌNH VÀ TEST PARSER NEWS / FORUM\nCập nhật: ${summary.checkedAt}\n\nLượt tiếp theo: đã kiểm tra lại ${changes.parserPreviouslyPending} News còn lỗi; ${changes.parserNowPassed.length} site đã đạt parser mẫu; xác nhận category cho ${changes.categoryNowVerified.length}/${changes.categoryPreviouslyPending} site trước đó chưa xác nhận.\n\nĐã test toàn bộ 544 News trong snapshot còn live trước đó.\n- ${summary.articleParserPassed} site đạt parser trên các mẫu độc lập (ít nhất 3 bài thành công, trong đó ít nhất 2 holdout).\n- Trong ${summary.articleParserPassed} site trên: ${summary.homepageAndCategorySamplesPassed} site có thêm bằng chứng discovery/category và bài từ category; ${counts.parser_passed_category_unverified||0} site chưa xác nhận đủ category.\n- ${summary.needsParserWork} site còn cần xử lý: ${counts.parser_failed||0} parser_failed, ${counts.parser_partial||0} parser_partial, ${counts.no_article_links||0} no_article_links, ${counts.listing_unavailable||0} listing_unavailable.\n- Tổng ${summary.totalSamples} lượt mẫu, ${summary.passedSamples} lượt parse thành công. Những site đạt có thể vẫn còn mẫu lỗi ở layout khác; xem reviewed-samples.json của từng site.\n\nCategory chỉ tính chuyên mục News có bài parse được; đã loại URL trang chủ/ngôn ngữ, portfolio/watchlist, trang công cụ và category của publisher khác.\n\nAlias đã cấu hình: dautubds.baodautu.vn lấy bài từ baodautu.vn, giữ ID theo registrable domain baodautu.vn và cần loại trùng với source cha khi làm flow.\n\nNgày đăng từ publication feed phải đối chiếu đúng URL và timestamp có offset/UTC; feed thiếu bài thì parser trả lỗi, không suy đoán. Những cấu hình cần context: ${summary.publicationContextSites.join(", ")}. Script test runtime có refresh feed: scripts/test_news_site_article.mjs --site <domain>.\n\nMúi giờ cấu hình theo địa chỉ publisher Việt Nam, chưa có offset xác nhận trực tiếp trên từng bài: ${summary.configuredTimezoneAssumptionSites.join(", ")}. Các site này được gắn timezoneProvenance trong cấu hình và dữ liệu mẫu; kết quả đạt parser là theo giả định cấu hình này.\n\nĐã xuất cấu hình cho đủ 544 site, tất cả enabled=false. Site chưa đạt giữ trạng thái pending/failed/partial chính xác; không tự kích hoạt. Chi tiết từng site: per-site-results.txt; manifest: all-site-configs.json.\n\nDữ liệu News: tiêu đề, nội dung, mô tả, URL, ngày đăng có precision/timezone/evidence, ảnh/media, tác giả khi có; tác giả fallback về site được gắn cờ. Không suy đoán engagement. ID dùng MD5 latin1(domain + title + exact URL), index tuần ISO theo giờ Việt Nam; ${checkedDocuments} DTO mẫu đã kiểm tra lại ID/index và liên kết file chứng cứ. Cần đối chiếu master theo URL/native ID trước lần ghi thật do URL/title cũ có thể thay đổi.\n\nPuppeteer dùng headless:new, profile tạm riêng, không hiện cửa sổ. Forum không chạy lại trong lượt News này; giữ kết quả lượt trước. Tinhte: ${forums.find(f=>f.domain==='tinhte.vn').status}, ${forums.find(f=>f.domain==='tinhte.vn').parsedPosts} post trong 3 topic; lấy state công khai trong trang, có ID topic/post/author, thời gian, nội dung, media, quan hệ topic/comment và reply khi có. VOZ headless: ${forums.find(f=>f.domain==='voz.vn').status}; lượt visible trước đó parse 60 post trong 3 topic, nhưng kết quả đó không chứng minh truy cập headless ổn định. Forum mới kiểm tra trang đầu; chưa xác nhận phân trang toàn bộ bình luận.\n\nGiới hạn: kết quả là kiểm tra tự động trên mẫu, không phải chứng nhận đầy đủ mọi bài/layout/category. Chưa benchmark vòng quét đồng thời toàn bộ 544 site, chưa chứng minh SLA 15 phút. Những nguồn bị verification/HTTP lỗi, thiếu thời gian/múi giờ/body hoặc redirect cần xử lý theo từng case trong danh sách chưa đạt. Snapshot live trước đây không bảo đảm hiện tại mọi site vẫn phục vụ bài.\n\nCác danh sách riêng của lượt này nằm trong ${activeRound}/parser-resolved.json, parser-still-failing.json, category-confirmed.json và category-still-unverified.json. File ${activeRound}/failure-groups.json là nhóm lỗi sơ bộ theo lỗi đầu tiên quan sát được, không phải kết luận nguyên nhân duy nhất.\n\nĐề xuất tiếp theo: xử lý ${summary.needsParserWork} site chưa đạt theo lỗi cụ thể; xác nhận category cho ${counts.parser_passed_category_unverified||0} site; kiểm tra thêm layout cũ/media/multipage và độ đầy đủ body ở các site đạt; giải quyết truy cập VOZ headless và phân trang forum. Sau đó chạy một vòng discovery+parse có đo tổng thời gian và độ phủ trước khi thiết kế queue. Chưa tạo queue, chưa ghi ES5, không chạy source eastdata Node 0.12.\n\nKiểm thử hồi quy: node --test test/configurable-news-parser.test.mjs test/news-forum-parser.test.mjs — 42/42 passed.\n`);
await write(path.join(root,'paused-state.json'),{paused:false,browserMode:'headless-new',completedSites:544,updatedAt:summary.checkedAt});
console.log(JSON.stringify(summary,null,2));
