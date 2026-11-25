import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import * as cheerio from 'cheerio';
const root=path.resolve('outputs/news-dantri-deepcheck-2026-11-10'),oldRoot=path.resolve('outputs/news-parser-round15-318-2026-11-10/final'),out=path.join(root,'current'),read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
await fs.mkdir(out,{recursive:true});
const summary=await read(path.join(root,'summary.json')),regression=await read(path.join(root,'positive-current-after-summary.json')),result=await read(path.join(root,'result.json')),tests=await fs.readFile(path.join(root,'final-tests.tap'),'utf8');
if(regression.total!==990||regression.failed||regression.identityRegressions.length||regression.contentChanges||!/# tests 154\n/.test(tests)||!/# fail 0\n/.test(tests))throw Error('Regression/test verification failed');
const registry=await read('outputs/news-parser-rollout-2026-11-09/all-site-configs.json');for(const site of registry){const config=await read(site.configurationFile);if(config.enabled!==false)throw Error('Activated source: '+site.domain);}
const table=await read(path.join(oldRoot,'site-errors-table.json'));table.rows=table.rows.filter(r=>r.domain!=='dantri.com.vn');table.statistics.sites=table.rows.length;table.statistics.statuses.parser_improved_partial--;table.update={checkedAt:summary.checkedAt,resolvedSource:'dantri.com.vn',evidenceDirectory:root,otherSourcesRetested:false};
if(table.rows.length!==304)throw Error('Remaining table mismatch');
const $=cheerio.load(await fs.readFile(path.join(oldRoot,'site-errors-table.html'),'utf8'));
$('tbody tr').each((i,e)=>{if($(e).find('td strong').first().text()==='dantri.com.vn')$(e).remove();});$('tbody tr').each((i,e)=>$(e).children('td').first().text(i+1));
$('title').text('Lỗi chi tiết 304 nguồn News — đã sửa Dân Trí');$('h1').text('Bảng lỗi hiện tại — 304 nguồn News');
$('header').prepend($('<p>').text('Cập nhật: Dân Trí đã sửa và đạt kiểm tra mẫu sau lần kiểm tra bổ sung. Những nguồn còn lại giữ nguyên bằng chứng Round 15; không quét lại trong lần kiểm tra riêng Dân Trí này.'));
const statusKeys=['http_or_parser_failed','parser_partial','parser_improved_partial'];$('.cards .card b').each((i,e)=>$(e).text(table.statistics.statuses[statusKeys[i]]));$('#count').text('304 / 304 site');
for(const key of statusKeys){const option=$('#status option').filter((i,e)=>$(e).attr('value')===key);option.text(option.text().replace(/\(\d+\)$/,'('+table.statistics.statuses[key]+')'));}
$('a[href]').each((i,e)=>{const href=$(e).attr('href');if(href.startsWith('sites/'))$(e).attr('href',path.relative(out,path.join(oldRoot,href)));});
await fs.writeFile(path.join(out,'site-errors-table.html'),$.html());await fs.writeFile(path.join(out,'site-errors-table.json'),JSON.stringify(table,null,2));
const report=[
 'DÂN TRÍ — KIỂM TRA KỸ VÀ SỬA PARSER',
 'Kết luận: dữ liệu có sẵn. Nhãn “thiếu” trước đó phản ánh parser chưa lấy được trường dữ liệu, chưa mô tả đúng nguyên nhân của từng layout.',
 '1. DMagazine: H1 là ảnh/không có text, còn tiêu đề đầy đủ nằm trong NewsArticle JSON-LD. Đã thêm variant lấy headline JSON-LD và body .e-magazine__body. Có 3 URL độc lập ngoài mẫu huấn luyện xác nhận, với nội dung khác nhau.',
 '2. DT360: HTML chứa JSON literal window.DT_GLOBAL.article và window.wDataLayer. Đã đọc title, sapo đầy đủ, published_date có múi giờ, tác giả và thông tin video. Chỉ JSON.parse dữ liệu công khai, không thực thi JavaScript nguồn. Kiểm tra ID/path/canonical trước khi parse; không suy ra ngày từ timestamp trong URL.',
 '3. AMACCAO: publisher khai báo page_type=cate và không có item_id. Đây là trang chuyên đề, đã chuyển sang category và vẫn lấy bài trong trang này.',
 '4. Category DT360: giao diện dùng API công khai recent-by-cate với zone/offset trên HTML. Adapter Axios đọc đúng API này, kiểm tra ID/path của từng link. Đã phát hiện được 6 link bài trong lần kiểm tra.',
 `${summary.freshArticles}/${summary.freshArticles} bài lấy lại/kiểm tra độc lập parse đạt: ${summary.dt360Articles} DT360, ${summary.dmagazineArticles} DMagazine, phần còn lại là bài thường/video. Có 1 URL chuyên đề được loại khỏi luồng article, giữ ở category.`,
 `Đã kiểm tra lại toàn bộ ${summary.originalFailedUrlsReviewed} URL cũ bị báo lỗi: 6 bài lấy được dữ liệu, 1 URL là category. ${summary.verifiedHlsPlaylists}/4 playlist trả HTTP 200, nội dung HLS hợp lệ; không tải video.`,
 '154/154 test đạt; 990/990 mẫu hồi quy vẫn parse đạt, không đổi ID/ngày/chỉ mục tuần/nội dung. Tất cả 544 cấu hình vẫn enabled:false. Chưa làm queue, chưa ghi ES5.',
 'Dân Trí hiện đạt bộ mẫu kiểm tra này; chưa chạy toàn bộ vòng quét và chưa xác nhận thời hạn 15 phút. Danh sách lỗi hiện tại còn 304 nguồn; các nguồn khác không được quét lại trong lần kiểm tra riêng này.',
 'Bằng chứng: result.json, final-results.json, training-proof.json, dt360-category-checks.json, manifest-checks.json, config-validated.json, final-tests.tap và positive-current-after-summary.json. Bảng hiện tại: current/site-errors-table.html.'
].join('\n\n')+'\n';
await fs.writeFile(path.join(root,'report.txt'),report);await fs.writeFile('docs/news-dantri-deepcheck-2026-11-10.txt',report);
const hashes={};for(const file of ['src/web/dantriNews.mjs','src/web/configurableNewsParser.mjs','src/web/newsDocumentKind.mjs','src/web/newsLinkPolicy.mjs','src/web/newsResearchTransport.mjs','test/dantri-news.test.mjs'])hashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
await fs.writeFile(path.join(root,'verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),testsPassed:154,regression,allConfigsDisabled:registry.length,remainingSources:table.rows.length,independentDmagazineHoldouts:result.independentDmagazineHoldouts,hashes,browserUsed:false,queueCreated:false,es5Written:false,fullSiteCycleVerified:false},null,2));
console.log(JSON.stringify({parsedArticles:summary.freshArticles,dt360:summary.dt360Articles,dmagazine:summary.dmagazineArticles,testsPassed:154,regressionPassed:990,disabledConfigs:registry.length,currentErrorTableRows:table.rows.length,categoryLinks:result.categoryChecks.at(-1).articleLinks}));
