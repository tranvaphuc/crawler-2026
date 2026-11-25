import {clean} from '../web/newsParser.mjs';
const months={'một':1,'hai':2,'ba':3,'tư':4,'bốn':4,'năm':5,'sáu':6,'bảy':7,'tám':8,'chín':9,'mười':10,'mười một':11,'mười hai':12};
// No Date.parse of locale strings, host timezone, guessed year, relative text,
// or modified time. Epoch units are explicit and never inferred from a label.
export function forumTime(raw,{kind='local',offsetMinutes=420,now=Date.now(),source='post',timezoneEvidence='configured UTC+07:00'}={}){
 const text=clean(raw);let ms,precision='second';
 if(kind==='seconds'||kind==='milliseconds'){
  if(!/^\d+$/.test(text))throw Error('invalid_epoch');ms=Number(text)*(kind==='seconds'?1000:1);
 }else if(kind==='iso'){
  const m=text.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,6}))?)?(Z|[+-]\d\d:?\d\d)$/);
  if(!m)throw Error('iso_offset_required');
  const [,y,mo,d,h,mi,s='0',fraction='',zone]=m;
  const offset=zone==='Z'?0:(zone[0]==='-'?-1:1)*(Number(zone.slice(1,3))*60+Number(zone.slice(-2)));
  if(zone!=='Z'&&(Number(zone.slice(1,3))>23||Number(zone.slice(-2))>59))throw Error('invalid_offset');
  ms=calendar(+y,+mo,+d,+h,+mi,+s,offset)+Number(('0.'+fraction))*1000;
  precision=m[6]?'second':'minute';
 }else{
  let t=text.replace(/\s+(?:lúc|at)\s+/i,' ').replace(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(\d{1,2}\/\d{1,2}\/\d{4})$/,'$2 $1').replace(/\s+Tháng\s+(mười một|mười hai|một|hai|ba|tư|bốn|năm|sáu|bảy|tám|chín|mười|\d{1,2})\s+/i,(_,m)=>'/'+(months[m.toLowerCase()]||Number(m))+'/');
  // Thai Buddhist calendar, only when explicitly selected by the site adapter.
  if(kind==='thai'){
   const names=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
   t=t.replace(/(\d{1,2})\s+(\S+)\s+(\d{4})\s+เวลา\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*น\.?/,(_,d,m,y,clock)=>`${d}/${names.indexOf(m)+1}/${Number(y)-543} ${clock}`);
  }
  let m=t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/),y,mo,d,h,mi,s;
  if(m){[,y,mo,d,h,mi,s='0']=m;precision=m[6]?'second':'minute';}
  else{m=t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);if(!m)throw Error('absolute_post_clock_required');[,d,mo,y,h,mi,s='0']=m;precision=m[6]?'second':'minute';if(y.length===2)y=Number(y)<70?'20'+y:'19'+y;if(m[7]){if(+h<1||+h>12)throw Error('invalid_12_hour_clock');h=(+h%12)+(/^PM$/i.test(m[7])?12:0);}}
  ms=calendar(+y,+mo,+d,+h,+mi,+s,offsetMinutes);
 }
 if(!Number.isFinite(ms)||ms<Date.UTC(1990,0,1)||ms>now+300000)throw Error('post_time_out_of_bounds');
 return {publishedDate:new Date(ms).toISOString(),raw:text,kind,precision,source,timezone:kind==='seconds'||kind==='milliseconds'?'UTC epoch':kind==='iso'?'explicit offset':`UTC${offsetMinutes>=0?'+':'-'}${String(Math.floor(Math.abs(offsetMinutes)/60)).padStart(2,'0')}:${String(Math.abs(offsetMinutes)%60).padStart(2,'0')}`,timezoneEvidence};
}
function calendar(y,m,d,h,mi,s,offset){
 if(!Number.isInteger(offset)||m<1||m>12||d<1||h<0||h>23||mi<0||mi>59||s<0||s>59)throw Error('invalid_calendar');
 const local=Date.UTC(y,m-1,d,h,mi,s),check=new Date(local);
 if(check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d)throw Error('invalid_calendar');return local-offset*60000;
}
export function ownedPostTime(node,{now=Date.now(),offsetMinutes=420}={}){
 // Restrict to attribution. Never fall back to edits, quotes, signatures or sidebars.
 let n=node.find('.message-attribution-main time,.datePermalink .DateTime,.messageMeta .privateControls a.DateTime,.messageMeta .privateControls .DateTime,.messageMeta .DateTime').filter((i,e)=>!node.find('.message-lastEdit,.messageLastEdit,.bbCodeBlock,.quote,.signature').find(e).length).first();
 if(!n.length)n=node.find('.message-attribution-main a[href*="/post-"]').first();
 if(!n.length)throw Error('owned_post_time_missing');const candidates=[];
 if(n.attr('datetime'))candidates.push(forumTime(n.attr('datetime'),{kind:'iso',now,source:'post attribution datetime'}));
 if(n.attr('data-timestamp'))candidates.push(forumTime(n.attr('data-timestamp'),{kind:'seconds',now,source:'post attribution data-timestamp'}));
 else if(/^\d{9,13}$/.test(n.attr('data-time')||''))candidates.push(forumTime(n.attr('data-time'),{kind:'seconds',now,source:'post attribution data-time'}));
 const title=n.attr('title');if(title){try{candidates.push(forumTime(title,{now,offsetMinutes,source:'post attribution title'}));}catch(e){if(!/absolute_post_clock_required/.test(e.message))throw e;}}
 if(!candidates.length)candidates.push(forumTime(n.text(),{now,offsetMinutes,source:'post attribution visible clock'}));
 for(const other of candidates.slice(1)){const a=Date.parse(candidates[0].publishedDate),b=Date.parse(other.publishedDate);const unit=other.precision==='minute'||candidates[0].precision==='minute'?60000:1000;if(Math.floor(a/unit)!==Math.floor(b/unit))throw Error('post_time_sources_disagree');}
 return {...candidates[0],crossChecks:candidates.slice(1)};
}
