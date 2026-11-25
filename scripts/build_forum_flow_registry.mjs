import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {isExcludedSource} from '../src/web/sourceExclusions.mjs';
const audit=JSON.parse(await fs.readFile('outputs/forum-activity-2026-11-17/summary.json','utf8')).filter(x=>x.status==='confirmed_activity'&&!isExcludedSource(x.domain));
const classic=new Set(['2banh.vn','carpassion.vn','chomoto.vn','diendan.gamethuvn.net','forum.gamevn.com','otofun.net','otosaigon.com','raovatdalat.vn','techrum.vn','vnbadminton.com','vnreview.vn','voz.vn','xetv.vn']);
const custom={'bovagau.vn':'bovagau','dff.vn':'dff','offb.vn':'offb','pantip.com':'pantip','phunuvietkhoinghiep.vn':'wordpress','tctd.vn':'wn','vietnambusinessinsider.vn':'wn','tinhte.vn':'tinhte'};
const rows=[];
for(const a of audit){const domain=a.domain;let legacy=null,legacySource=null;try{const file=path.resolve('../eastdata/scripts/forum/sites',domain+'.json');const raw=await fs.readFile(file,'utf8');const old=JSON.parse(raw);legacy={seedUrls:old.seed_urls||[old.seed_url].filter(Boolean),urlProcessor:old.url_processor,postProcessor:old.post_processor,commentProcessor:old.comment_processor,priority:old.priority||0,maxPage:old.max_page||10};legacySource={file,sha256:createHash('sha256').update(raw).digest('hex')};}catch(e){if(e.code!=='ENOENT')throw e;}
 const detail=JSON.parse(await fs.readFile(`outputs/forum-activity-2026-11-17/${domain}.audit.json`,'utf8'));const home=detail.pages[0].url;
 const hosts=[...new Set([domain,'www.'+domain,...detail.pages.map(p=>{try{return new URL(p.url).hostname;}catch{return null;}}).filter(Boolean)])];
 const feeds=detail.pages.filter(p=>/whats-new|find-new/.test(p.url)&&!p.error).map(p=>p.url.replace(/\/(whats-new\/posts)\/\d+\/?$/,'/$1/').replace(/\/find-new\/\d+\/posts\/?$/,'/find-new/posts'));
 let seeds=legacy?.seedUrls?.length?legacy.seedUrls:[feeds[0]||home];
 if(domain==='otofun.net')seeds=['https://www.otofun.net.vn/whats-new/posts/'];
 if(['voz.vn','tinhte.vn'].includes(domain))seeds=[home,...(legacy?.seedUrls||[])];
 if(domain==='2banh.vn')seeds=[home,...seeds];
 if([home,...hosts,...seeds].some(isExcludedSource))continue;
 const adapter=classic.has(domain)?'xenforo':custom[domain];
 const pattern=adapter==='xenforo'?(domain==='voz.vn'?'^/t/[^/]+\\.\\d+/?$':'^/threads/[^/]+\\.\\d+/?$'):({bovagau:'^/[^/]+-\\d+$',dff:'-p\\d+\\.html$',offb:'^/[^/]+-\\d+$',pantip:'^/topic/\\d+$',wn:'-a\\d+\\.html$',tinhte:'^/thread/[^/]+[./]\\d+/?$',wordpress:null})[adapter];
 rows.push({domain,adapter,homepage:home,allowedHosts:hosts,seeds:[...new Set(seeds)],threadPattern:pattern,offsetMinutes:420,timezone:'Asia/Ho_Chi_Minh',timezoneEvidence:adapter==='pantip'?'Asia/Bangkok UTC+07; Buddhist calendar converted explicitly':adapter==='xenforo'?'native epoch/offset preferred; local title cross-checked when available':'native epoch/explicit offset preferred; local VN wall clock UTC+07',priority:legacy?.priority||0,pollSeconds:60,maxSeedPages:legacy?.maxPage||10,maxThreadPagesPerRun:100,legacySource,legacy});
}
await fs.mkdir('config/forum-flow',{recursive:true});await fs.writeFile('config/forum-flow/sites.json',JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify({sites:rows.length,legacyConfigs:rows.filter(x=>x.legacy).length,adapters:[...new Set(rows.map(x=>x.adapter))]}));
