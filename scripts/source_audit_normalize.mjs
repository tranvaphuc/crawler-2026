import {normalizeFacebookSource} from './facebook_source_resolver.mjs';
const site=(h,d)=>h===d||h.endsWith('.'+d);
export function normalizeSource(input,channelHint='Website'){
 let u;try{u=new URL(/^https?:/i.test(input)?input:'https://'+input);}catch{return {channel:channelHint,url:input,key:channelHint+'|'+input,unresolved:'URL không hợp lệ'};}
 if(u.username||u.password)return null;
 u.hash='';const h=u.hostname.toLowerCase().replace(/^www\./,''),parts=u.pathname.split('/').filter(Boolean);let channel=channelHint,url,id=null,type=null,reason='';
 if(site(h,'facebook.com')||site(h,'fb.com')){
  channel='Facebook';let path=decodeURIComponent(u.pathname).replace(/\\+\/?$/,'').replace(/\/+$/,'');
  const compound=/^\/(\d+)_(\d+)$/.exec(path);
  if(compound)return {channel,url:u.href,key:'Facebook|pending:'+u.href,ownerCandidate:compound[1],unresolved:'Link số_số có thể là source_post hoặc post_comment; cần xác minh tác giả qua redirect'};
  else if(/^\/(?:permalink|story|photo)\.php$/.test(path)&&u.searchParams.get('id')){path='/'+u.searchParams.get('id');reason='Lấy owner id từ URL bài đăng';}
  else if(/^\/groups\/[^/]+\/(?:posts|permalink)\//i.test(path)){path=path.split('/').slice(0,3).join('/');reason='Đổi bài trong group về group';}
  else if(/^\/[^/]+\/(?:posts|videos|photos|reels?)\//i.test(path)&&!/^\/(?:share|watch|photo|reel|videos)\//i.test(path)){path='/'+path.split('/')[1];reason='Đổi bài đăng về trang tác giả';}
  if(/^\/(?:photo\.php|story\.php|permalink\.php|watch|reel|share)(?:\/|$)/i.test(path))return {channel,url:u.href,key:'Facebook|pending:'+u.href,unresolved:'Chưa xác định được source từ link nội dung'};
  const candidate=new URL('https://www.facebook.com'+path);if(path==='/profile.php')candidate.search=u.search;
  const f=normalizeFacebookSource(candidate.href);
  if(f.status==='SOURCE')return {...f,channel,url:f.url,key:'Facebook|'+f.key,sourceKey:f.key,conversion:reason,id:null,type:f.typeHint==='group'?'group':null};
  return {channel,url:u.href,key:'Facebook|pending:'+u.href,conversion:reason,unresolved:'Chưa xác định được source từ link nội dung'};
 }
 if(site(h,'fb.watch'))return {channel:'Facebook',url:u.href,key:'Facebook|pending:'+u.href,unresolved:'Link video rút gọn; cần tìm tác giả'};
 if(site(h,'youtube.com')||h==='youtu.be'){
  channel='YouTube';type='channel';
  if(parts[0]==='channel'&&/^UC[\w-]{22}$/.test(parts[1]??'')){id=parts[1];url='https://www.youtube.com/channel/'+id;}
  else if(parts[0]?.startsWith('@')||['c','user'].includes(parts[0]))url='https://www.youtube.com/'+parts.slice(0,parts[0].startsWith('@')?1:2).join('/');
  else{url=h==='youtu.be'?'https://www.youtube.com/watch?v='+parts[0]:['shorts','live','embed'].includes(parts[0])?'https://www.youtube.com/watch?v='+parts[1]:u.href;reason='Cần lấy channel tác giả của video';}
 }else if(site(h,'threads.net')||site(h,'threads.com')){
  channel='Threads';type='profile';url=parts[0]?.startsWith('@')?'https://www.threads.com/'+parts[0]:u.href;
 }else if(site(h,'instagram.com')){
  channel='Instagram';type='profile';url=parts[0]&&!['p','reel','reels','stories','explore','accounts','share'].includes(parts[0])?'https://www.instagram.com/'+parts[0]+'/':u.href;
  if(parts[0]==='stories'&&parts[1]&&parts[1]!=='highlights')url='https://www.instagram.com/'+parts[1]+'/';
 }else if(site(h,'tiktok.com')){
  channel='TikTok';type='profile';url=parts[0]?.startsWith('@')?'https://www.tiktok.com/'+parts[0]:u.href;
 }else if(site(h,'linkedin.com')){
  channel='LinkedIn';type=['company','school','showcase'].includes(parts[0])?'company':parts[0]==='in'?'user':null;
  url=type?'https://www.linkedin.com/'+parts.slice(0,2).join('/')+'/':u.href;
 }else if(h==='x.com'||site(h,'twitter.com')){
  channel='X';type='profile';url=parts[0]&&!['i','search','intent','share','home'].includes(parts[0])?'https://x.com/'+parts[0]:u.href;
 }else if((site(h,'google.com')&&/^\/maps(?:\/|$)/.test(u.pathname))||h==='maps.app.goo.gl'||h==='g.page'||h==='goo.gl'&&/^\/maps\//.test(u.pathname)||h.startsWith('maps.google.')){
  channel='GG Reviews';type='place';url=u.href;id=u.searchParams.get('cid');
 }else{
  if(/^cms\./.test(h)||['docs.google.com','drive.google.com','accounts.google.com'].includes(h))return null;
  channel=['News','Forum'].includes(channelHint)?channelHint:'Website';type=channel==='News'?'news':channel==='Forum'?'forum':'website';id=h;url=u.protocol+'//'+h+'/';
 }
 return {channel,url,id,type,key:channel+'|'+(id||url),conversion:reason};
}
