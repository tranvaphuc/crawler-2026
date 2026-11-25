export const USER_CONFIRMED_VIETNAM_CLOCK = 'user_confirmed_vietnam_article_clock';
// The user confirmed the displayed local clock for these exact publishers on 2026-11-16.
export const confirmedVietnamClockSites = new Set(['2sao.vn','baodienbienphu.vn','baoquangtri.vn','congan.lamdong.gov.vn','danang24h.vn','dnvn247.com.vn','dongvon.doanhnhanvn.vn','giaoducvaxahoi.vn','golfviet.vn','hangthat.thuonghieucongluan.com.vn','hatinh24h.com.vn','htcc.vn','infonet.vietnamnet.vn','investglobal.vn','kinhtechungkhoan.vn','nghean24h.vn','nguoidothi.net.vn','nhaquanly.vn','nhipsonghanoi.hanoimoi.vn','thanhhoa24h.net.vn','thegioidisan.vn','thuonghieusanpham.vn','thuongtruong24h.vn','tintuconline.com.vn','video.afamily.vn','vietq.vn','xethitruong.vn']);
const confirmationDates = new Map([...confirmedVietnamClockSites].map(site=>[site,'2026-11-16']));
for(const site of ['vn.stockproxx.com','vietnamnews.vn','nghenhinvietnam.vn','baoninhbinh.org.vn','hungyentv.vn','vccinews.com','doisongvanhoa.com','xecongnghe.vn','nhipcaudautu.vn','dientungaynay.vn','taichinhdoanhnghiep.net.vn','tinxe.vn','dzogame.vn','kinhtexahoi.vn','kenhtinxe.com','truyenhinh.baobinhduong.vn']){confirmedVietnamClockSites.add(site);confirmationDates.set(site,'2026-11-17');}
const confirmedAliases=new Map([['baodansinh.vn',new Set(['baodansinh.vn','dansinh.dantri.com.vn'])],['kinhtetrunguong.vn',new Set(['kinhtetrunguong.vn','cscltw.dcs.vn'])]]);
const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; } };
for(const site of ['bbw.vn','baodaklak.vn','moit.gov.vn','baodansinh.vn','kinhtetrunguong.vn','sbv.gov.vn']){confirmedVietnamClockSites.add(site);confirmationDates.set(site,'2026-11-17');}
export function userConfirmedPublicationTimezone(config, url) {
 const p = config.timezoneProvenance;
 return config.publicationTimePolicy === USER_CONFIRMED_VIETNAM_CLOCK && config.timezone === 'Asia/Ho_Chi_Minh'
  && p?.authority === 'explicit_user_confirmation' && p.confirmation === 'displayed_clock_is_vietnam_time_'+confirmationDates.get(p.scope)
  && p.scope === config.siteName && confirmedVietnamClockSites.has(p.scope) && (!url || host(url) === p.scope || confirmedAliases.get(p.scope)?.has(host(url)));
}
export function userConfirmedTimezoneProof(proof) {
 if (proof?.publicationTimePolicy !== USER_CONFIRMED_VIETNAM_CLOCK) return true;
 return userConfirmedPublicationTimezone({publicationTimePolicy: proof.publicationTimePolicy, timezone: proof.timezone,
  timezoneProvenance: proof.timezoneAuthority, siteName: proof.timezoneAuthority?.scope}, proof.url);
}
