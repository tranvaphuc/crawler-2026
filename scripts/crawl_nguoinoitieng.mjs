import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { setDefaultResultOrder } from 'node:dns';
import * as cheerio from 'cheerio';
import {fetchTextWithDeadline} from './nguoinoitieng_http.mjs';

setDefaultResultOrder('ipv4first');

export const BASE = 'https://nguoinoitieng.tv';
const reviewedEvidence=JSON.parse(fs.readFileSync(new URL('../config/nguoinoitieng-reviewed-evidence.json',import.meta.url),'utf8'));
const compact = value => String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const unknown = value => !value || /^(?:đang cập nhật|chưa (?:rõ|có)|updating|n\/a|không rõ)/i.test(value);
export function absolute(value, base = BASE) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { const u = new URL(value, base); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; }
}
export function pageKind(value) {
  const u = new URL(value);
  if (u.origin !== BASE) return null;
  if (/^\/nghe-nghiep\/[^/]+\/[^/]+\/[a-z0-9-]{1,8}\/?$/.test(u.pathname)) return 'profile';
  if (/^\/nghe-nghiep\/[^/]+(?:\/page\d+)?\/?$/.test(u.pathname)) return 'listing';
  if (/^\/tinh-tp\/[^/]*viet-nam(?:\/page\d+)?\/?$/.test(u.pathname)) return 'listing';
  if (u.pathname === '/moi-nhat/') return 'listing';
  return null;
}
export function normalizeUrl(value) {
  const u = new URL(value); u.hash = '';
  if (u.pathname !== '/moi-nhat/') u.search = '';
  else { const p = Number(u.searchParams.get('p')); u.search = p > 1 && p <= 5 ? '?p=' + p : ''; }
  if (u.pathname !== '/' && u.pathname !== '/moi-nhat/') u.pathname = u.pathname.replace(/\/$/, '');
  return u.href;
}
function textLines($, node) {
  const copy = $(node).clone();
  copy.find('script,style,ins,.share,.bn').remove();
  copy.find('br').replaceWith('\n');
  copy.find('p,li,div,h2,h3').each((_, el) => $(el).append('\n'));
  return copy.text().split(/\n+/).map(compact).filter(Boolean).join('\n');
}
const NON_PEOPLE = /^(?:nhom-|ban-nhac$|kenh-|chuong-trinh-|phim(?:-|$)|bo-phim$|bai-hat$|ca-khuc$|thuong-hieu$|doanh-nghiep$|cong-ty$|cau-lac-bo|doi-tuyen|dia-diem|nhan-vat-(?:hu-cau|trong-phim|hoat-hinh)|nhat-vat-hoat-hinh|su-kien|trang-web|website|to-chuc|san-pham|tac-pham|game$|giai-thuong$|group$|fanpage$|hang-thu-am$|lien-hoan-phim|mang-xa-hoi$|mascot$|tap-chi$|talkshow$|trai-he$|truyen-tranh$|du-an$|sieu-anh-hung$|hang-xe$|salon-toc$)/;
export function profileEntityType(occupationSlug,sourceId){
  return NON_PEOPLE.test(occupationSlug)||reviewedEvidence[sourceId]?.decision==='exclude_entity'?'non_person_or_channel':'person';
}
function platformName(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  for (const [suffix, name] of [['facebook.com','facebook'],['fb.com','facebook'],['fb.me','facebook'],['instagram.com','instagram'],['tiktok.com','tiktok'],['youtube.com','youtube'],['youtu.be','youtube'],['threads.net','threads'],['threads.com','threads'],['twitter.com','twitter'],['x.com','twitter'],['linkedin.com','linkedin'],['zalo.me','zalo'],['wikipedia.org','wikipedia']]) {
    if (host === suffix || host.endsWith('.' + suffix)) return name;
  }
  return 'website';
}
function accountFields(url, platform) {
  const u=new URL(url);const segments=u.pathname.split('/').filter(Boolean);
  let accountId=null,handle=null,canonical=url,kind='external_link';
  if(platform==='facebook'){
    accountId=u.searchParams.get('id');
    if(segments[0]==='people')accountId??=segments[2]??null;
    if(!accountId&&segments.length&& !['profile.php','watch','reel','story.php','photo.php','permalink.php'].includes(segments[0]))handle=segments[0];
    if(segments[0]==='groups'){accountId=segments[1]??null;handle=null;canonical='https://www.facebook.com/groups/'+(accountId??'');kind='group';}
    else if(accountId){canonical='https://www.facebook.com/profile.php?id='+encodeURIComponent(accountId);kind='account_or_page';}
    else if(handle){canonical='https://www.facebook.com/'+handle;kind=/\/(?:posts|videos|photos|reel)\//.test(u.pathname)?'content_link':'account_or_page';}
  }else if(['instagram','tiktok','threads','twitter'].includes(platform)){
    handle=segments[0]?.replace(/^@/,'')??null;
    kind=(platform==='instagram'&&['p','reel','reels'].includes(segments[0]))||/\/(?:video|post|status)\//.test(u.pathname)?'content_link':'account';
    if(kind==='content_link'&&platform==='instagram')handle=null;
  }else if(platform==='youtube'){
    if(segments[0]==='channel')accountId=segments[1]??null;
    else if(segments[0]?.startsWith('@'))handle=segments[0].slice(1);
    else if(['c','user'].includes(segments[0]))handle=segments[1]??null;
    kind=accountId||handle?'channel':'content_or_other_link';
  }
  return {hostname:u.hostname,account_id:accountId,handle,canonical_account_url:kind==='content_link'?null:canonical,link_kind:kind};
}
export function classifyProfile(p) {
  const evidence = [];
  const add = (type, value, rule) => evidence.push({ type, value, rule, source_url: p.source_url });
  if (p.entity_type !== 'person'||profileEntityType(p.occupation_slug,p.source_id)!=='person') return { status: 'non_person', included: false, confidence: 'high', evidence, review_reasons: ['Danh mục có thể là nhóm/kênh/tác phẩm thay vì một cá nhân lịch sử thuộc phạm vi người Việt.'] };
  const reviewed=reviewedEvidence[p.source_id];
  if(reviewed && compact(reviewed.expected_name)===compact(p.name)){
    const isLocal=reviewed.source_type==='archived_profile_manual_review';
    const isBirth=reviewed.decision==='vietnamese_birth_supported';
    const foreign=reviewed.decision==='foreign_identity_reported';
    evidence.push({type:foreign?'foreign_identity_reviewed':isBirth?'born_in_vietnam_reviewed':isLocal?'source_vietnamese_origin_reviewed':'independent_vietnamese_origin',value:reviewed.finding,rule:reviewed.review_method,source_url:reviewed.source_url,reviewed_at:reviewed.reviewed_at});
    return {status:foreign?'foreign_identity_reviewed':isBirth?'vietnamese_origin_supported':isLocal?'vietnamese_source_reviewed':'vietnamese_external_supported',included:!foreign,confidence:foreign?'source_statement':isBirth?'inferred_from_birthplace':isLocal?'source_statement_reviewed':'independent_reporting',evidence,review_reasons:[foreign?'Nguồn mô tả người nước ngoài; chưa có bằng chứng Việt/gốc Việt.':isBirth?'Xuất thân Việt Nam theo nơi sinh; chưa xác minh quốc tịch.':'Bằng chứng Việt/gốc Việt được lưu cùng nguồn và phương pháp đối chiếu; không đồng nghĩa có quốc tịch Việt Nam.']};
  }
  const intro = p.sections.filter(s => /Tiểu sử|Tóm tắt lý lịch/.test(s.title)).map(s => s.text).join('\n');
  const sentences = intro.split(/(?<=[.!?\n])\s+/).map(compact).filter(Boolean);
  // Require a statement about the subject, rather than a mention of Vietnam in a career story.
  const subjectSentences = sentences.filter((s,i) => i < 12 && !/^(?:bố|mẹ|cha|vợ|chồng|bạn|con|anh trai|chị gái|em trai|em gái)\s/i.test(s.replace(/^[-–]\s*/,'')));
  const identityClause=(s,target)=>{
    for(const m of s.matchAll(/(?:^|\s)là\s+([^.!?\n]{1,160})/giu)){
      const hit=m[1].match(target);if(!hit)continue;
      const prefix=m[1].slice(0,hit.index);
      // Nationality must describe the subject, not an author, spouse, colleague or institution mentioned later.
      if(/(?:^|\s)(?:của|cùng|với|về|trong|bố|mẹ|cha|vợ|chồng|bạn|con|tác giả)\s/iu.test(prefix))continue;
      return true;
    }
    return false;
  };
  const identity = subjectSentences.filter(s => identityClause(s,/(?:người Việt(?: Nam)?|gốc Việt|(?:ca sĩ|diễn viên|nghệ sĩ|nhạc sĩ|nhà văn|cầu thủ|vận động viên)\s+(?:của\s+)?Việt Nam)/iu) || /^(?:[^.!?]{0,80})(?:mang|có)\s+quốc tịch\s+Việt Nam/iu.test(s) || /^(?:[-–]\s*)?(?:[\p{L}.\s]{1,60})?\s+là\s+(?:một\s+)?Việt kiều/iu.test(s));
  for (const s of identity.slice(0,5)) add('explicit_vietnamese_identity', s, 'subject_identity_in_biography');
  const birthVN = /^Việt Nam$/i.test(compact(p.birthplace.country));
  const residenceVN = /(?:nước|quốc gia)\s+Việt Nam/i.test(p.residence.country_title ?? '');
  if (birthVN) add('born_in_vietnam', p.birthplace.statement, 'source_birth_summary');
  if (residenceVN) add('lives_or_works_in_vietnam', p.residence.country_title, 'source_location_title');
  // Country capitalization matters: "người anh hùng" and "người ý thức"
  // are not statements that somebody is English or Italian.
  const foreignIdentity = subjectSentences.filter(s => identityClause(s,/người\s+(?:Hàn Quốc|Trung Quốc|Nhật Bản|Thái Lan|Ấn Độ|Mỹ|Hoa Kỳ|Anh|Pháp|Đức|Canada|Úc|Nga|Brazil|Tây Ban Nha|Ý|Italia|Philippines|Indonesia)(?=[\s,.!?;:]|$)/u) && !/gốc Việt|Việt kiều/i.test(s));
  const review = [];
  if (identity.length) {
    if (foreignIdentity.length) review.push('Có cả mô tả quốc tịch khác; có thể là người gốc Việt/đa quốc tịch hoặc nội dung về người liên quan.');
    return { status: 'vietnamese_explicit', included: true, confidence: 'source_statement', evidence, review_reasons: review };
  }
  if (birthVN) {
    review.push('Nguồn ghi sinh tại Việt Nam; đây là suy luận xuất thân, chưa phải xác minh quốc tịch.');
    if (foreignIdentity.length) { foreignIdentity.forEach(s => add('foreign_identity',s,'biography_identity')); return {status:'needs_review',included:false,confidence:'conflicting',evidence,review_reasons:review}; }
    return { status: 'vietnamese_origin_supported', included: true, confidence: 'inferred_from_birthplace', evidence, review_reasons: review };
  }
  if (residenceVN) {
    review.push('Sống/làm việc ở Việt Nam không chứng minh là người Việt.');
    return { status: 'needs_review', included: false, confidence: 'insufficient', evidence, review_reasons: review };
  }
  for (const s of foreignIdentity.slice(0,3)) add('foreign_identity',s,'biography_identity');
  return { status: foreignIdentity.length ? 'foreign_identity_reported' : 'unresolved_origin', included: false, confidence: foreignIdentity.length ? 'source_statement' : 'insufficient', evidence, review_reasons: foreignIdentity.length ? [] : ['Chưa có bằng chứng rõ về xuất thân Việt trong nguồn.'] };
}
export function parseProfile(html, sourceUrl, fetchedAt = new Date().toISOString()) {
  const $ = cheerio.load(html);
  if (!$('.info-nnt .motangan h2').length) throw new Error('PROFILE_LAYOUT_MISSING');
  const parts = new URL(sourceUrl).pathname.split('/').filter(Boolean);
  const fields = $('.motangan > p').map((_,e) => {
    const label = compact($(e).children('b').first().text()).replace(/:\s*$/, '');
    const el = $(e).clone(); el.children('b').first().remove();
    return { label, value: compact(el.text()), title: $(e).attr('title') ?? null, links: $(e).find('a[href]').map((_,a) => ({url:absolute($(a).attr('href'),sourceUrl),text:compact($(a).text())})).get() };
  }).get();
  const sections = $('.thongtinchitiet .title-chitiet').map((_,el) => {
    const next = $(el).nextAll('.about-nnt').first();
    // Do not attach another section's text when this heading has no own body.
    let valid = false;
    for (let n = el.nextSibling; n; n = n.nextSibling) { if ($(n).hasClass('title-chitiet')) break; if (n === next[0]) {valid = true;break;} }
    return { id:$(el).find('a[id]').attr('id')??null, title:compact($(el).find('h2,h3').text()), text:valid?textLines($,next):'', html:valid?next.html():null };
  }).get();
  const biographyNode = $('.thongtinchitiet');
  const social = [];
  $('.motangan > p a[href], .thongtinchitiet .about-nnt a[href]').each((_,a) => {
    const raw = $(a).attr('href'); const url = absolute(raw, sourceUrl);
    if (!url || new URL(url).hostname.endsWith('nguoinoitieng.tv')) return;
    if (/\/(?:sharer(?:\.php)?|share|intent|dialog)\b|[?&](?:u|url)=/i.test(url)) return;
    const platform = platformName(url);
    if (social.some(x => x.url === url)) return;
    const context = compact($(a).parent().text());
    social.push({platform,url,label:compact($(a).text()),context:context.slice(0,1200),source_selector:$(a).closest('.motangan').length?'.motangan > p':'.about-nnt',attribution:$(a).closest('.motangan').length?'subject_profile_link':'biography_link_requires_review',verification:'listed_by_source_not_independently_verified'});
  });
  // Preserve unlinked social URLs in biographies too.
  const plain = sections.map(s=>s.text).join('\n');
  for (const raw of plain.match(/https?:\/\/[^\s<>"']+/gi)??[]) {
    const url = absolute(raw.replace(/[),.;]+$/,''));
    if (url && !social.some(x=>x.url===url) && platformName(url)!=='website') social.push({platform:platformName(url),url,label:null,context:'URL trong nội dung tiểu sử',source_selector:'.about-nnt',attribution:'biography_link_requires_review',verification:'listed_by_source_not_independently_verified'});
  }
  for(const link of social)Object.assign(link,accountFields(link.url,link.platform));
  const get = re => fields.find(f=>re.test(f.label));
  const residence = get(/Nơi sống|làm việc/);
  const birthSummary = sections.find(s=>/Tóm tắt lý lịch/.test(s.title))?.text??'';
  const birthLine = birthSummary.match(/[^\n]*sinh ra tại[^\n]+/i)?.[0]??null;
  const birthPlaceMatch = birthLine?.match(/sinh ra tại\s+([^\n]*?(?:nước\s+|bang\s+[^.!?\n]*?[-–]\s*)([^.!?\n]+))\.?/i);
  const birthplace = birthPlaceMatch?`${compact($('.motangan h2').first().text())} sinh ra tại ${birthPlaceMatch[1]}.`:birthLine;
  const birthCountry = birthPlaceMatch?.[2]?.trim()??null;
  const placeLink = $('a[href*="/tinh-tp/"]').filter((_,a)=>/^Nơi sinh:/i.test(compact($(a).parent().text()))).first();
  const images = [];
  $('.info-nnt img, .thongtinchitiet img').each((_,e)=>{
    const url=absolute($(e).attr('data-src')??$(e).attr('src'),sourceUrl);
    if(url && !images.some(x=>x.url===url)) images.push({url,alt:compact($(e).attr('alt')),title:$(e).attr('title')??null});
  });
  const notes = $('.note').map((_,e)=>textLines($,e)).get();
  const summaryFields=$('nav p').map((_,el)=>{
    const label=compact($(el).children('b').first().text()).replace(/:\s*$/,'');if(!label)return null;
    const value=$(el).clone();value.children('b').first().remove();
    return {label,value:compact(value.text()),links:$(el).find('a[href]').map((_,a)=>({url:absolute($(a).attr('href'),sourceUrl),label:compact($(a).text()),title:$(a).attr('title')??null})).get()};
  }).get();
  const p = {
    schema_version:2, source_id:parts.at(-1), source_url:sourceUrl, fetched_at:fetchedAt,
    name:compact($('.motangan h2').first().text()), title:compact($('h1').first().text()),
    occupation:compact($('.info-nnt .nganhhd').text())||compact($('.brc a').eq(1).text()),occupation_slug:parts[1],
    entity_type:profileEntityType(parts[1],parts.at(-1)),
    birth_date_raw:get(/Ngày tháng năm sinh/)?.value??null,
    birthplace:{statement:birthplace,country:birthCountry,source:'Tóm tắt lý lịch',city_link:placeLink.attr('href')?absolute(placeLink.attr('href')):null},
    residence:{value:residence?.value??null,country_title:residence?.title??null,source_label:residence?.label??null},
    rank_overall_raw:get(/XH chung/)?.value??null,rank_occupation_raw:compact($('.starnumber').text()),
    fields,summary_fields:summaryFields,sections,platform_links:social,images,source_notes:notes,
    source_meta:{description:$('meta[name="description"]').attr('content')??null,keywords:$('meta[name="keywords"]').attr('content')??null,canonical:$('link[rel="canonical"]').attr('href')??null},
    biography_text:plain,raw_profile_text:textLines($,biographyNode),
    related_profiles:biographyNode.find('a[href]').map((_,a)=>{const url=absolute($(a).attr('href'),sourceUrl);return url&&pageKind(url)==='profile'?{url,label:compact($(a).text()),context:compact($(a).parent().text()).slice(0,600)}:null;}).get(),
    taxonomy_links:$('#content a[href]').map((_,a)=>{const url=absolute($(a).attr('href'),sourceUrl);return url&&new URL(url).origin===BASE&&/\/(?:tinh-tp|sinh-|con-giap|cung-hoang-dao|theo-ten)/.test(new URL(url).pathname)?{url,label:compact($(a).text()),context:compact($(a).parent().text()).slice(0,300),attribution:$(a).closest('nav').length?'profile_summary':'page_navigation_or_related'}:null;}).get(),
  };
  const dob=p.birth_date_raw?.match(/^(\d{1,2})-(\d{1,2})-(-?\d+)/);
  const year=dob?.[3]??p.birth_date_raw?.match(/(?:^|[-/])(-?\d{3,4})(?=\s|$|\()/)?.[1];
  p.birth_date=dob?{day:Number(dob[1]),month:Number(dob[2]),year:Number(dob[3]),iso:Number(dob[3])>0?`${dob[3].padStart(4,'0')}-${dob[2].padStart(2,'0')}-${dob[1].padStart(2,'0')}`:null}:year?{day:null,month:null,year:Number(year),iso:null}:null;
  const age=p.birth_date_raw?.match(/\((\d+) tuổi\)/)?.[1];p.age_as_reported=age?Number(age):null;
  p.real_name_raw=plain.match(/(?:tên thật(?:\s+(?:của[^.\n]{1,70}))?\s+(?:là\s+)?|tên khai sinh(?:\s+là)?\s+)([^.\n,;]{2,100})/i)?.[1]?.trim()??null;
  const measurements=sections.find(s=>/Chiều cao cân nặng/.test(s.title))?.text??'';
  p.measurements={height_raw:measurements.match(/Chiều cao:\s*([^\n]+)/i)?.[1]??null,weight_raw:measurements.match(/Cân nặng:\s*([^\n]+)/i)?.[1]??null,body_raw:measurements.match(/Số đo 3 vòng:\s*([^\n]+)/i)?.[1]??null};
  p.contact={email_raw:get(/^Email/)?.value??null,phone_raw:get(/Số điện thoại/)?.value??null};
  p.birthplace.location=summaryFields.find(f=>f.label==='Nơi sinh')?.value??null;
  p.zodiac=summaryFields.find(f=>f.label==='Cung hoàng đạo')?.value??null;
  p.lunar_year=summaryFields.find(f=>f.label==='Con giáp')?.value??null;
  p.vietnam_classification=classifyProfile(p);
  p.quality={has_subject_platform_link:social.some(x=>x.attribution==='subject_profile_link'),has_any_platform_link:social.length>0,missing_fields:fields.filter(f=>unknown(f.value)).map(f=>f.label),nationality_independently_verified:false,profile_links_independently_verified:false};
  return p;
}

export function openStore(out) {
  fs.mkdirSync(out,{recursive:true});
  const db = new DatabaseSync(path.join(out,'celebrities.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=10000;
    CREATE TABLE IF NOT EXISTS crawl_queue(url TEXT PRIMARY KEY,kind TEXT NOT NULL,priority INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,discovered_from TEXT,created_at TEXT NOT NULL,finished_at TEXT,http_status INTEGER,error TEXT,next_attempt_at INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS queue_work ON crawl_queue(status,priority DESC,next_attempt_at);
    CREATE TABLE IF NOT EXISTS pages(url TEXT PRIMARY KEY,final_url TEXT,fetched_at TEXT NOT NULL,http_status INTEGER NOT NULL,sha256 TEXT NOT NULL,html_gzip BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS profiles(source_id TEXT PRIMARY KEY,source_url TEXT UNIQUE NOT NULL,name TEXT NOT NULL,occupation TEXT,occupation_slug TEXT,entity_type TEXT,birth_date_raw TEXT,birth_country TEXT,residence TEXT,residence_country_title TEXT,vietnam_status TEXT,included_vietnamese INTEGER,has_platform_link INTEGER,fetched_at TEXT NOT NULL,profile_json TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS profile_filter ON profiles(vietnam_status,occupation_slug);
    CREATE TABLE IF NOT EXISTS platform_links(source_id TEXT NOT NULL,platform TEXT NOT NULL,url TEXT NOT NULL,attribution TEXT NOT NULL,link_json TEXT NOT NULL,PRIMARY KEY(source_id,url));
    CREATE TABLE IF NOT EXISTS classification_evidence(source_id TEXT NOT NULL,type TEXT NOT NULL,value TEXT NOT NULL,rule TEXT NOT NULL,source_url TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS evidence_person ON classification_evidence(source_id);
    CREATE TABLE IF NOT EXISTS listing_edges(listing_url TEXT NOT NULL,profile_url TEXT NOT NULL,name TEXT,place_url TEXT,occupation TEXT,PRIMARY KEY(listing_url,profile_url));
    CREATE TABLE IF NOT EXISTS crawl_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS classification_review_log(source_id TEXT NOT NULL,reviewed_at TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,PRIMARY KEY(source_id,reviewed_at));
    CREATE VIEW IF NOT EXISTS vietnamese_people AS SELECT * FROM profiles WHERE included_vietnamese=1;
    CREATE VIEW IF NOT EXISTS vietnamese_explicit AS SELECT * FROM profiles WHERE vietnam_status='vietnamese_explicit';
    CREATE VIEW IF NOT EXISTS vietnamese_inferred AS SELECT * FROM profiles WHERE vietnam_status='vietnamese_origin_supported';
    CREATE VIEW IF NOT EXISTS people_need_review AS SELECT * FROM profiles WHERE entity_type='person' AND included_vietnamese=0;
    CREATE VIEW IF NOT EXISTS people_filterable AS SELECT source_id,source_url,name,occupation,occupation_slug,entity_type,birth_country,residence,residence_country_title,vietnam_status,included_vietnamese,has_platform_link,fetched_at,
      json_extract(profile_json,'$.real_name_raw') AS real_name,
      json_extract(profile_json,'$.birth_date.iso') AS birth_date,
      json_extract(profile_json,'$.birth_date.year') AS birth_year,
      json_extract(profile_json,'$.measurements.height_raw') AS height_raw,
      json_extract(profile_json,'$.measurements.weight_raw') AS weight_raw,
      json_extract(profile_json,'$.contact.email_raw') AS email_raw,
      json_extract(profile_json,'$.contact.phone_raw') AS phone_raw
      FROM profiles;
  `);
  return db;
}
function insertProfile(db,p) {
  db.prepare(`INSERT INTO profiles VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET source_url=excluded.source_url,name=excluded.name,occupation=excluded.occupation,occupation_slug=excluded.occupation_slug,entity_type=excluded.entity_type,birth_date_raw=excluded.birth_date_raw,birth_country=excluded.birth_country,residence=excluded.residence,residence_country_title=excluded.residence_country_title,vietnam_status=excluded.vietnam_status,included_vietnamese=excluded.included_vietnamese,has_platform_link=excluded.has_platform_link,fetched_at=excluded.fetched_at,profile_json=excluded.profile_json`).run(p.source_id,p.source_url,p.name,p.occupation,p.occupation_slug,p.entity_type,p.birth_date_raw,p.birthplace.country,p.residence.value,p.residence.country_title,p.vietnam_classification.status,Number(p.vietnam_classification.included),Number(p.quality.has_subject_platform_link),p.fetched_at,JSON.stringify(p));
  db.prepare('DELETE FROM platform_links WHERE source_id=?').run(p.source_id);
  db.prepare('DELETE FROM classification_evidence WHERE source_id=?').run(p.source_id);
  const link=db.prepare('INSERT OR REPLACE INTO platform_links VALUES(?,?,?,?,?)');
  for(const l of p.platform_links)link.run(p.source_id,l.platform,l.url,l.attribution,JSON.stringify(l));
  const ev=db.prepare('INSERT INTO classification_evidence VALUES(?,?,?,?,?)');
  for(const e of p.vietnam_classification.evidence)ev.run(p.source_id,e.type,e.value,e.rule,e.source_url);
}
function stats(db) {
  return {updated_at:new Date().toISOString(),queue:db.prepare('SELECT kind,status,count(*) AS count FROM crawl_queue GROUP BY kind,status').all(),profiles:db.prepare('SELECT vietnam_status,count(*) AS count,sum(has_platform_link) AS with_subject_platform_link FROM profiles GROUP BY vietnam_status').all(),platform_links:db.prepare('SELECT platform,count(*) AS count FROM platform_links GROUP BY platform').all(),total_profiles:db.prepare('SELECT count(*) AS n FROM profiles').get().n,listing_pages:db.prepare("SELECT count(*) AS n FROM crawl_queue WHERE kind='listing' AND status='done'").get().n,failed:db.prepare("SELECT url,kind,attempts,http_status,error FROM crawl_queue WHERE status='failed' LIMIT 30").all(),failed_total:db.prepare("SELECT count(*) n FROM crawl_queue WHERE status='failed'").get().n,pending_total:db.prepare("SELECT count(*) n FROM crawl_queue WHERE status IN ('pending','running')").get().n};
}
export function exportData(db,out) {
  function* rows(where){
    // Keep keyset traversal on the primary key. Choosing the nationality index for
    // an IN filter makes SQLite sort gigabytes of profile_json again per batch.
    const statement=db.prepare('SELECT source_id,profile_json FROM profiles INDEXED BY sqlite_autoindex_profiles_1 WHERE ('+where+') AND source_id>? ORDER BY source_id LIMIT 100');
    let cursor='';
    while(true){const batch=statement.all(cursor);if(!batch.length)break;for(const row of batch)yield row;cursor=batch.at(-1).source_id;}
  }
  for(const [name,where] of [['all-profiles','1=1'],['vietnamese',"included_vietnamese=1"],['vietnamese-explicit',"vietnam_status='vietnamese_explicit'"],['needs-review',"vietnam_status IN ('needs_review','unresolved_origin')"],['non-person',"entity_type!='person'"]]) {
    const target=path.join(out,name+'.jsonl');
    const fd=fs.openSync(target+'.tmp','w');
    // Bounded keyset batches avoid whole-archive memory allocation and Node 22 iterator finalization.
    for(const row of rows(where)) fs.writeSync(fd,row.profile_json+'\n');
    fs.closeSync(fd);
    fs.renameSync(target+'.tmp',target);
    if(name==='vietnamese'){
      const jsonTarget=path.join(out,name+'.json');const jsonFd=fs.openSync(jsonTarget+'.tmp','w');
      fs.writeSync(jsonFd,'[\n');let first=true;
      for(const row of rows(where)){fs.writeSync(jsonFd,(first?'':',\n')+row.profile_json);first=false;}
      fs.writeSync(jsonFd,'\n]\n');fs.closeSync(jsonFd);fs.renameSync(jsonTarget+'.tmp',jsonTarget);
    }
  }
  const report=stats(db);
  report.collection_state=report.pending_total?'in_progress':report.failed_total?'frontier_exhausted_with_errors':'frontier_exhausted';
  report.coverage_note='Trạng thái phản ánh các URL đã phát hiện; không chứng minh website công bố đầy đủ mọi người Việt nổi tiếng.';
  fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(report,null,2));
  return report;
}

async function crawl(args) {
  const out=path.resolve(args.out??'outputs/nguoinoitieng-2026-11-18');
  const db=openStore(out);
  if(args.export){console.log(JSON.stringify(exportData(db,out)));db.close();return;}
  if(args.reclassify){
    const select=db.prepare('SELECT source_id,profile_json FROM profiles WHERE source_id>? ORDER BY source_id LIMIT 100');let cursor='',count=0;
    const audit=db.prepare('INSERT INTO classification_review_log VALUES(?,?,?,?)');
    while(true){const batch=select.all(cursor);if(!batch.length)break;db.exec('BEGIN');try{for(const r of batch){const p=JSON.parse(r.profile_json);const before=JSON.stringify({entity_type:p.entity_type,classification:p.vietnam_classification});p.entity_type=profileEntityType(p.occupation_slug,p.source_id);p.vietnam_classification=classifyProfile(p);const after=JSON.stringify({entity_type:p.entity_type,classification:p.vietnam_classification});if(before!==after){audit.run(p.source_id,new Date().toISOString(),before,after);insertProfile(db,p);}count++;}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}cursor=batch.at(-1).source_id;}
    console.log('reclassified',count);console.log(JSON.stringify(exportData(db,out)));db.close();return;
  }
  if(args.reparse){let n=0;const {gunzipSync}=await import('node:zlib');const urls=db.prepare("SELECT p.url FROM pages p JOIN crawl_queue q ON q.url=p.url WHERE q.kind='profile' AND q.status='done'").all();const fetchPage=db.prepare('SELECT * FROM pages WHERE url=?');for(const {url} of urls){const r=fetchPage.get(url);insertProfile(db,parseProfile(gunzipSync(r.html_gzip).toString('utf8'),r.url,r.fetched_at));if(++n%1000===0)console.log('reparsed',n);}console.log(JSON.stringify(exportData(db,out)));db.close();return;}
  const lockPath=path.join(out,'crawler.lock.json');
  if(fs.existsSync(lockPath)){
    const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
    let alive=false;try{process.kill(lock.pid,0);alive=true;}catch{}
    if(alive)throw new Error('Crawler already running, pid='+lock.pid);
    fs.unlinkSync(lockPath);
  }
  fs.writeFileSync(lockPath,JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}),{flag:'wx'});
  process.on('exit',()=>{try{fs.unlinkSync(lockPath);}catch{}});
  db.exec("UPDATE crawl_queue SET status='pending' WHERE status='running'");
  const enqueueStmt=db.prepare('INSERT INTO crawl_queue(url,kind,priority,discovered_from,created_at) VALUES(?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET priority=max(crawl_queue.priority,excluded.priority)');
  const enqueue=(url,from,priority=0,kind=pageKind(url))=>{if(!kind)return;const u=normalizeUrl(url);enqueueStmt.run(u,kind,priority,from,new Date().toISOString());};
  for(const url of [BASE+'/',BASE+'/tinh-tp/ho-chi-minh-viet-nam',BASE+'/moi-nhat/'])enqueue(url,'seed',500,'listing');
  const {response:robotsResponse,body:robots}=await fetchTextWithDeadline(BASE+'/robots.txt');
  if(!robotsResponse.ok)throw new Error('ROBOTS_HTTP_'+robotsResponse.status);
  fs.writeFileSync(path.join(out,'robots.txt'),robots);
  for(const url of robots.match(/https:\/\/nguoinoitieng\.tv\/sitemap\d*\.xml/g)??[])enqueue(url,'robots',450,'sitemap');
  let stopping=false;process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
  let lastRequest=0;let gate=Promise.resolve();let cooldownUntil=0;let started=Date.now();let finished=0;
  const interval=Number(args.interval??200);const concurrency=Number(args.concurrency??6);
  async function pace(){const previous=gate;let release;gate=new Promise(r=>release=r);await previous;try{const wait=Math.max(0,lastRequest+interval-Date.now(),cooldownUntil-Date.now());if(wait)await new Promise(r=>setTimeout(r,wait));lastRequest=Date.now();}finally{release();}}
  const claim=db.prepare("SELECT * FROM crawl_queue WHERE status='pending' AND next_attempt_at<=? ORDER BY priority DESC,rowid ASC LIMIT 1");
  const running=db.prepare("UPDATE crawl_queue SET status='running',attempts=attempts+1 WHERE url=?");
  function discover(html,url,kind){
    const $=cheerio.load(html,{xmlMode:kind==='sitemap'});
    if(kind==='sitemap'){for(const e of $('loc').toArray()){const u=absolute($(e).text());if(u)enqueue(u,url,380);}return;}
    const candidates=new Map();
    $('figure').each((_,el)=>{
      const a=$(el).find('a.tennnt').first();const u=absolute(a.attr('href'),url);
      if(!u||pageKind(u)!=='profile')return;
      const place=absolute($(el).find('a[href*="/tinh-tp/"]').first().attr('href'),url);
      const local=place?.includes('-viet-nam');candidates.set(normalizeUrl(u),local?300:50);
      db.prepare('INSERT OR IGNORE INTO listing_edges VALUES(?,?,?,?,?)').run(url,normalizeUrl(u),compact(a.text()),place,compact($(el).find('.nsnnt').text()));
    });
    $('a[href]').each((_,a)=>{
      const u=absolute($(a).attr('href'),url);if(!u||new URL(u).origin!==BASE)return;
      const k=pageKind(u);if(!k)return;
      let priority=k==='listing'?100:40;
      if(k==='listing'&&u.includes('/tinh-tp/'))priority=400;
      if(candidates.has(normalizeUrl(u)))priority=candidates.get(normalizeUrl(u));
      enqueue(u,url,priority,k);
    });
  }
  async function handle(job){
    try{
      await pace();
      const {response:r,body}=await fetchTextWithDeadline(job.url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; PublicBiographyArchive/1.0)','Accept':'text/html,application/xml;q=0.9,*/*;q=0.8'},redirect:'follow'});
      if(!r.ok){const e=new Error('HTTP_'+r.status);e.httpStatus=r.status;e.retryAfter=r.headers.get('retry-after');throw e;}
      if(new URL(r.url).origin!==BASE)throw new Error('UNEXPECTED_OFFSITE_REDIRECT');
      if(/captcha|checking your browser|verify you are human/i.test(body)&&body.length<10000){cooldownUntil=Date.now()+60000;throw new Error('ORIGIN_CHALLENGE');}
      const now=new Date().toISOString();
      // Parse before marking the request complete; a successful HTTP response alone is not success.
      const profile=job.kind==='profile'?parseProfile(body,job.url,now):null;
      db.exec('BEGIN');try{
        db.prepare('INSERT OR REPLACE INTO pages VALUES(?,?,?,?,?,?)').run(job.url,r.url,now,r.status,createHash('sha256').update(body).digest('hex'),gzipSync(body));
        if(profile)insertProfile(db,profile);
        discover(body,job.url,job.kind);
        db.prepare("UPDATE crawl_queue SET status='done',finished_at=?,http_status=?,error=NULL WHERE url=?").run(now,r.status,job.url);
        db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      finished++;
    }catch(e){
      const attempt=job.attempts+1;
      if(e.httpStatus===429||e.httpStatus===503)cooldownUntil=Math.max(cooldownUntil,Date.now()+Math.max(30000,Number(e.retryAfter??0)*1000));
      if(e.code==='REQUEST_DEADLINE')cooldownUntil=Math.max(cooldownUntil,Date.now()+30000);
      const retry=attempt<4&&![404,410].includes(e.httpStatus);
      db.prepare('UPDATE crawl_queue SET status=?,error=?,http_status=?,next_attempt_at=? WHERE url=?').run(retry?'pending':'failed',String(e.message??e).slice(0,1000),e.httpStatus??null,Date.now()+Math.min(60000,2000*2**attempt),job.url);
    }
  }
  let lastExport=Date.now();
  const timer=setInterval(()=>{
    const s=stats(db);s.elapsed_seconds=Math.round((Date.now()-started)/1000);s.requests_this_run=finished;s.pid=process.pid;s.collection_state='in_progress';s.last_profile_saved_at=db.prepare('SELECT max(fetched_at) latest FROM profiles').get().latest;
    fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(s,null,2));
    console.log(JSON.stringify(s));
    if(Date.now()-lastExport>=300000){try{exportData(db,out);lastExport=Date.now();}catch(e){console.error('CHECKPOINT_EXPORT_FAILED',e.message);}}
  },30000);
  const active=new Set();const limit=Number(args.limit??Infinity);
  try{
    while(!stopping&&finished<limit){
      if(fs.existsSync(path.join(out,'STOP'))){stopping=true;break;}
      while(active.size<concurrency&&!stopping&&finished+active.size<limit){const j=claim.get(Date.now());if(!j)break;running.run(j.url);const task=handle(j).finally(()=>active.delete(task));active.add(task);}
      if(active.size){await Promise.race(active);continue;}
      const pending=db.prepare("SELECT min(next_attempt_at) AS due,count(*) AS n FROM crawl_queue WHERE status='pending'").get();
      if(!pending.n)break;
      await new Promise(r=>setTimeout(r,Math.min(1000,Math.max(50,pending.due-Date.now()))));
    }
    await Promise.all(active);
  }finally{
    clearInterval(timer);console.log(JSON.stringify(exportData(db,out)));
    db.prepare('INSERT OR REPLACE INTO crawl_meta VALUES(?,?)').run('last_run',JSON.stringify({finished_at:new Date().toISOString(),stopped:stopping,limit:args.limit??null,interval,concurrency}));
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args={};for(let i=2;i<process.argv.length;i++){const k=process.argv[i].replace(/^--/,'');args[k]=process.argv[i+1]&&!process.argv[i+1].startsWith('--')?process.argv[++i]:true;}
  crawl(args).catch(e=>{console.error(e);process.exitCode=1;});
}
