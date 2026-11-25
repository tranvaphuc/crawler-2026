import fs from 'node:fs/promises';
const root='outputs/news-speed-2026-11-13';
const decode=b=>b.toString(b[0]===255?'utf16le':'utf8').replace(/^\uFEFF/,'');
const records=decode(await fs.readFile(`${root}/after-seed-fix-observation.jsonl`)).split(/\r?\n/).flatMap(s=>{try{return [JSON.parse(s)];}catch{return [];}});
if(!records.length){console.log('No complete sample yet');process.exit(0);}
const first=records[0],last=records.at(-1),before=JSON.parse(decode(await fs.readFile(`${root}/before-seed-fix.log`)).trim().split(/\r?\n/).at(-1)),seconds=last.lastRuntime?.elapsedSeconds-first.lastRuntime?.elapsedSeconds;
const report={checkedAtVietnam:new Date(last.checkedAt).toLocaleString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}),observationMinutes:last.elapsedMinutes,samples:records.length,baseline:{httpPerSecond:before.wireSpeed?.perSecond,last5m:before.windows[0],sitesSeededWithin20m:before.seedFreshness.within20m},after:{httpPerSecond:seconds>0?Math.round((last.lastRuntime.wireRequests-first.lastRuntime.wireRequests)/seconds*100)/100:null,last30s:last.wire,last5m:last.last5m,sinceObservation:last.sinceObservation,newPublicationCohort:last.newPublicationCohort,seedFreshness:last.seedFreshness,discoveryAdmission:last.lastRuntime?.discoveryAdmission?.blocked,lanes:last.lastRuntime?.inFlightByRole,tasks:last.tasks,outbox:last.outbox,service:last.service},coverageCaveat:'Seed freshness means at least one completed homepage/category HTTP task per publisher, not every category and not article recall. New-publication cohort includes only observed, valid articles published after observation began. A 20-minute publication-to-confirmed-import measurement is not proof every published article was discovered.'};
await fs.writeFile(`${root}/seed-fix-comparison.json`,JSON.stringify(report,null,2));
if(process.argv.includes('--final')){
 const a=report.after,b=report.baseline;
 const lines=[`SỬA COOLDOWN CHẶN VÒNG QUÉT — ${report.checkedAtVietnam} (UTC+7)`,
  'Đã deploy release /opt/news-flow/releases/20261113-05; nguồn runtime/state trên VPS khớp SHA256 với source local.',
  '100/100 regression tests pass cả local và VPS; 11/11 proxy HTTPS hoạt động; ES5 mapping/proof verified.',
  'Thay đổi: seed_schedule lưu lịch riêng từng publisher; chỉ nhận lượt khi site đó hết seed pending/running, hết cooldown và đến hạn tối thiểu 5 phút. Kiểm tra lại mỗi 5 giây sau lượt khởi động. Cooldown/backlog site khác không chặn admission. Enqueue và schedule atomic, chống lặp lượt; giữ FIFO, host spacing, task cũ và ES5 identity/field/time gates.',
  `Cửa sổ theo dõi sau deploy: ${report.observationMinutes} phút; ${report.samples} snapshot.`,
  `HTTP: trước ${b.httpPerSecond} request/giây; sau ${a.httpPerSecond} request/giây.`,
  `5 phút trước deploy: ${b.last5m.seeds} seed hoàn tất, ${b.last5m.verified} bài đạt, ${b.last5m.esResults.created} bài tạo mới ES.`,
  `5 phút cuối quan sát: ${a.last5m.seeds} seed hoàn tất, ${a.last5m.verified} bài đạt, ${a.last5m.created} bài tạo mới ES.`,
  `Toàn cửa sổ: ${a.sinceObservation.seeds} seed, ${a.sinceObservation.seedSites} site có seed hoàn tất; ${a.sinceObservation.admittedSites} site được admission mới kể từ lúc bắt đầu quan sát; ${a.sinceObservation.created} bài được xác nhận tạo mới ES.`,
  `Bài xuất bản sau khi bắt đầu quan sát: ${a.newPublicationCohort.verified} bài qua kiểm tra; ${a.newPublicationCohort.created} bài xác nhận tạo mới ES, ${a.newPublicationCohort.createdWithin20m} bài import trong 20 phút từ khi đăng. Lag phút: ${JSON.stringify(a.newPublicationCohort.importLagMinutes)}.`,
  `Site có ít nhất một seed hoàn tất trong 20 phút gần nhất: ${a.seedFreshness.within20m}/544. Đây không phải số site đã quét hết category trong 20 phút.`,
  `Tổng outbox: ${JSON.stringify(a.outbox)}.`,
  `Service: ${a.service.replace(/\n/g,'; ')}.`,
  'Kết luận: đã gỡ điều kiện backlog seed toàn hệ thống. Các số đo bài đăng mới chỉ mô tả những bài đã quan sát và import thành công, chưa chứng minh bắt được mọi bài mới của toàn bộ 544 site trong 20 phút. Những URL/site không truy cập hoặc parse được vẫn có thể bị bỏ lỡ.',
  '', 'TIMELINE (phút | HTTP/s cửa sổ gần nhất | seed trong 5p | site có seed trong 20p | tổng ES tạo mới từ lúc đo | bài mới sau lúc đo đã tạo ES)'];
 for(const r of records)lines.push([r.elapsedMinutes,r.wire?.perSecond??'',r.last5m.seeds,r.seedFreshness.within20m,r.sinceObservation.created,r.newPublicationCohort.created].join(' | '));
 try{const d=JSON.parse(decode(await fs.readFile(`${root}/post-fix-diagnostics-final.json`)));lines.push('','KIỂM TRA RIÊNG HOMEPAGE SAU CỬA SỔ ĐO',`Thời điểm: ${d.checkedAt}; homepage có request hoàn tất trong 20 phút: ${d.homepageCoverage.within20m}/544.`,`Homepage đã có hai lần hoàn tất cách nhau <=20 phút với lần mới thuộc giai đoạn sau deploy: ${d.homepageCoverage.postDeployRepeatWithin20m}.`,`Outbox chờ ghi, phút: ${JSON.stringify(d.writerWaitMinutes)}.`,`Nút thắt còn lại: admission theo từng site đã chạy, nhưng các seed lượt mới vẫn xếp sau category cũ trong FIFO toàn queue. Chưa đạt SLA 20 phút toàn bộ danh sách. Với ${13783} seed và tốc độ ${Math.round(a.sinceObservation.seeds/report.observationMinutes)} seed/phút đo được, đọc đủ seed cần khoảng ${Math.round(13783/(a.sinceObservation.seeds/report.observationMinutes))} phút nếu giữ nguyên thông lượng; không suy ra mọi bài cần chờ từng ấy vì một bài có thể xuất hiện trên nhiều seed.`);}catch{}
 try{const g=JSON.parse(decode(await fs.readFile(`${root}/coverage-gaps-final.json`)));lines.push('',`SITE KHÔNG CÓ SEED HOÀN TẤT TRONG 20 PHÚT — ${g.checkedAt}`);for(const s of g.gaps)lines.push(`${s.site} | lần cuối: ${s.lastSeedMinutesAgo??'chưa có'} phút | lý do task cuối: ${s.lastReason} | cooldown hiện tại: ${s.cooldown??'không'}`);}catch{}
 await fs.writeFile('news-seed-cooldown-fix-2026-11-13.txt',lines.join('\n')+'\n');
}
console.log(JSON.stringify(process.argv.includes('--compact')?{at:report.checkedAtVietnam,minutes:report.observationMinutes,http:report.after.httpPerSecond,last5m:report.after.last5m,total:report.after.sinceObservation,cohort:report.after.newPublicationCohort,siteFresh20:report.after.seedFreshness.within20m,lanes:report.after.lanes,service:report.after.service}:report));
