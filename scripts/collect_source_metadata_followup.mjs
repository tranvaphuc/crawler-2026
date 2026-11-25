/** Check public source pages. Persist only target-bound identity and summary metadata. */
import fs from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { decode, parseMetadata } from './source_audit_metadata.mjs';

const workspace = 'outputs/source-keyword-catalog-2026-11-19/cross-platform-audit/source-metadata-followup';
const targets = JSON.parse(await fs.readFile(`${workspace}/targets.json`, 'utf8'));
const logPath = `${workspace}/public.jsonl`;
const names = {facebook:'Facebook', youtube:'YouTube', tiktok:'TikTok', instagram:'Instagram', threads:'Threads', linkedin:'LinkedIn'};
const domains = { facebook:['facebook.com','fb.com'], youtube:['youtube.com'], tiktok:['tiktok.com'],
  instagram:['instagram.com'], threads:['threads.net','threads.com'], linkedin:['linkedin.com'] };

function allowed(url, channel) {
  return url.protocol === 'https:' && !url.port && !url.username && !url.password &&
    domains[channel].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
}

function route(url, channel) {
  let path = url.pathname.replace(/\/+$/, '');
  if (channel === 'facebook') {
    if (path === '/profile.php' && /^\d+$/.test(url.searchParams.get('id') ?? '') &&
        !['fbid','story_fbid','comment_id'].some(key => url.searchParams.has(key))) path = `/${url.searchParams.get('id')}`;
    path = path.replace(/^\/pg\//i, '/').replace(/\/(?:about|community|followers|members|people)$/i, '');
    path = path.replace(/^\/(?:pages|people)\/[^/]+\/(\d+)$/i, '/$1');
    if (/^\/groups\/[\w.%-]+$/i.test(path)) return path.toLowerCase();
    if (/^\/[\w.%-]+$/.test(path) && !/^\/(?:\d+_\d+|login|checkpoint|groups|profile\.php|watch|events|share|search|reel|marketplace|help|facebook|pages)$/i.test(path)) return path.toLowerCase();
    return null;
  }
  if (channel === 'youtube') {
    return /^\/(?:@[^/]+|(?:c|channel|user)\/[^/]+|[\w%-]+)(?:\/(?:featured|about|shorts|videos))?$/i.test(path)
      && !/^\/(?:watch|playlist|feed|results|shorts|live|redirect)$/i.test(path)
      ? path.replace(/\/(?:featured|about|shorts|videos)$/i,'').toLowerCase() : null;
  }
  if (channel === 'linkedin') return /^\/(?:company|school|showcase)\/[\w.%-]+$/i.test(path) ? path.toLowerCase() : null;
  if (channel === 'instagram' && /^\/(?:explore|accounts|direct|stories|reels?|p|share)$/i.test(path)) return null;
  return (channel === 'instagram' ? /^\/[\w.]+$/ : /^\/@[\w.]+$/).test(path) ? path.toLowerCase() : null;
}

function openGraph(html, key) {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if ((tag.match(/(?:property|name)=["']([^"']*)["']/i)?.[1] ?? '') === key) {
      return decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '').trim();
    }
  }
  return '';
}

async function getPage(url, channel) {
  for (let redirects=0; redirects<4 && allowed(url,channel); redirects++) {
    if (/^\/(?:login|checkpoint|accounts\/login|authwall|challenge)(?:[/.]|$)/i.test(url.pathname)) return {status:'AUTH_REQUIRED',url:url.href};
    const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000),
      headers:{'user-agent':'Mozilla/5.0','accept-language':'en-US,en;q=0.8'}});
    if (response.status>=300 && response.status<400 && response.headers.get('location')) {
      await response.body?.cancel();
      url=new URL(response.headers.get('location'),url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return {status:[401,403,429,999].includes(response.status)?'ACCESS_LIMIT':'HTTP_ERROR',httpStatus:response.status,
        retryAfter:response.headers.get('retry-after'),url:url.href};
    }
    const reader=response.body.getReader(),chunks=[];
    let size=0;
    for (;;) {
      const result=await reader.read();
      if (result.done) break;
      size+=result.value.length;
      if (size>7000000) {await reader.cancel();break;}
      chunks.push(result.value);
    }
    const body=Buffer.concat(chunks).toString('utf8');
    if (/"require_login"\s*:\s*true|<title[^>]*>\s*(?:Log in|Sign in)|Security Check Required|Please complete the CAPTCHA/i.test(body)) {
      return {status:'AUTH_REQUIRED',url:url.href,httpStatus:response.status};
    }
    return {status:'PAGE_READ',httpStatus:response.status,url:url.href,body};
  }
  return {status:'UNSUPPORTED_REDIRECT',url:url.href};
}

function* structured(html) {
  for (const [,body] of html.matchAll(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let root;
    try {root=JSON.parse(body);} catch {continue;}
    const stack=[root];
    while(stack.length) {
      const value=stack.pop();
      if (!value || typeof value!=='object') continue;
      yield value;
      for (const child of Object.values(value)) if (child && typeof child==='object') stack.push(child);
    }
  }
}

const id = value => typeof value==='string' && /^[1-9]\d{3,24}$/.test(value) ? value : null;

function facebook(page,expected) {
  const finalRoute=route(new URL(page.url),'facebook');
  let canonical;
  try {canonical=new URL(openGraph(page.body,'og:url'));} catch {return null;}
  const canonicalRoute=route(canonical,'facebook');
  if (!allowed(canonical,'facebook') || !finalRoute || !canonicalRoute) return null;
  const title=openGraph(page.body,'og:title').replace(/\s+\|[^|]+$/,'').trim();
  if (!title || /^(?:Facebook|Facebook User|Log in|Sign in|Content not available)$/i.test(title)) return null;
  const description=openGraph(page.body,'og:description');
  const candidates=new Map();
  const profiles=new Set();
  const groupId=id(finalRoute.match(/^\/groups\/(\d+)$/)?.[1]);
  const group=finalRoute.startsWith('/groups/');
  let privacy=null;
  let exactProfileAlias=false;
  function add(kind, identity, evidence) {
    if (identity) candidates.set(`${kind}:${identity}`,{type:kind,id:identity,identityEvidence:evidence});
  }
  for (const node of structured(page.body)) {
    const current=node.initialRouteInfo?.route;
    if (current && current.rootView?.props && /^(?:comet\.fbweb\.)?Comet(?:Profile|Group)/.test(current.canonicalRouteName ?? '')) {
      const root=current.rootView.props;
      if (group) {
        const proved=id(root.groupID ?? root.groupId);
        if (!groupId || groupId===proved) add('group',proved,'Facebook target initial route rootView.props.groupID');
      } else {
        const pageId=id(root.pageID ?? root.pageId);
        const profileId=id(root.userID ?? root.profileID);
        if (profileId) profiles.add(profileId);
        if (/^\/\d+$/.test(expected) && [pageId,profileId].filter(Boolean).some(value=>`/${value}`===expected)) exactProfileAlias=true;
        if (pageId) add('page',pageId,'Facebook target initial route rootView.props.pageID');
        if (!pageId && current.canonicalRouteName==='comet.fbweb.CometProfileLoggedOutRoute') {
          add('user',profileId,'Facebook target personal route rootView.props.userID');
        }
      }
    }
    if (group && groupId && node.__typename==='Group' && id(node.id)===groupId && node.name) {
      add('group',groupId,'Facebook Group object matched target group ID');
      const text=(node.privacy_info?.title?.text ?? node.privacy_info?.label?.text ?? '').trim();
      const state=/^(?:public(?: group)?|nhóm công khai)$/i.test(text)?'public':/^(?:private(?: group)?|nhóm riêng tư|nhóm kín)$/i.test(text)?'private':null;
      if (state && (!privacy || privacy===state)) privacy=state;
      else if (state) privacy='conflict';
    }
    if (!group && Array.isArray(node) && node[0]==='RelayPrefetchedStreamCache' && /ProfileCometHeaderQuery/.test(node[3]?.[0] ?? '')) {
      const actor=node[3]?.[1]?.__bbox?.result?.data?.user?.profile_header_renderer?.user;
      if (!actor?.name || !id(actor.id)) continue;
      let ownRoute;
      try {ownRoute=route(new URL(actor.url),'facebook');}catch{}
      if (ownRoute!==finalRoute && `/${actor.id}`!==finalRoute && `/${actor.id}`!==expected) continue;
      if (actor.is_additional_profile_plus===false) add('user',id(actor.id),'Facebook primary header personal profile id');
      else if (actor.delegate_page?.id) add('page',id(actor.delegate_page.id),'Facebook primary header delegate_page.id');
      else if (actor.__typename==='Page') add('page',id(actor.id),'Facebook primary header Page.id');
    }
  }
  if (canonicalRoute!==finalRoute && (!exactProfileAlias || group)) return null;
  const label=description.match(/(?:^|\s)([\d.,]+\s*(?:[KMB]|nghìn|triệu)?\s+(?:followers?|người theo dõi))(?=\b|\s|[·.])/iu)?.[1];
  const proof=candidates.size===1?[...candidates.values()][0]:{};
  return {name:title,...proof,privacy:proof.type==='group'&&privacy!=='conflict'?privacy:null,
    metricText:!group&&(finalRoute===expected||exactProfileAlias||proof.id)&&candidates.size<=1?label:null,
    metricEvidence:'Facebook og:description on matching source route',identityConflict:candidates.size>1,
    profileId:profiles.size===1?[...profiles][0]:null};
}

function other(source,page) {
  const channel=source.channel;
  const actual=route(new URL(page.url),channel);
  if (!actual) return null;
  const html=page.body;
  const value=parseMetadata({channel:names[channel],type:source.type,url:source.link,id:null},page);
  if (!value.id || !value.name || value.status!=='live') return null;
  let metricText=null;
  if (channel==='youtube') {
    const primary=html.match(/"channelMetadataRenderer"\s*:\s*\{[^}]*?"externalId"\s*:\s*"(UC[\w-]{22})"/)?.[1];
    if (primary!==value.id) return null;
    metricText=html.match(/"subscriberCountText"\s*:\s*\{\s*"(?:simpleText|content)"\s*:\s*"([\d,.KMB]+\s+subscribers?)"/i)?.[1];
    value.type='channel';
  } else if (channel==='tiktok') {
    const raw=html.match(/<script[^>]*\bid="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    const profile=raw&&JSON.parse(raw)?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo;
    if (!profile?.user || `/@${profile.user.uniqueId}`.toLowerCase()!==actual || String(profile.user.id)!==value.id) return null;
    const count=profile.statsV2?.followerCount??profile.stats?.followerCount;
    if (/^\d+$/.test(String(count))) metricText=`${count} followers`;
    value.type='profile';
  } else if (channel==='instagram'||channel==='threads') {
    const canonical=new URL(openGraph(html,'og:url'));
    if (!allowed(canonical,channel)||route(canonical,channel)!==actual||!/\(@[^)]+\)/.test(openGraph(html,'og:title'))) return null;
    metricText=openGraph(html,'og:description').match(/(?:^|\s)([\d,.KMB]+\s+followers)\b/i)?.[1];
    value.type='profile';
  } else if (channel==='linkedin') {
    if (!/^\/(?:company|school|showcase)\//.test(actual)) return null;
    metricText=html.match(/(?:^|\s)([\d,.KMB]+\s+followers)\s*</i)?.[1];
    value.type='company';
  }
  return {...value,metricText,metricEvidence:`${names[channel]} matched profile header`};
}

const previous=new Set();
try {for (const line of (await fs.readFile(logPath,'utf8')).trim().split('\n')) if (line) previous.add(JSON.parse(line).sourceKey);}
catch (error) {if (error.code!=='ENOENT') throw error;}
const channels=process.argv.slice(2);
const queue=targets.filter(source=>!previous.has(source.source_key)&&(!channels.length||channels.includes(source.channel)));
const batches=Map.groupBy(queue,source=>{
  if(source.channel!=='facebook')return source.channel;
  if(source.type.startsWith('group_'))return 'facebook-group';
  if(source.type==='page')return 'facebook-page';
  return /facebook\.com\/(?:\d|profile\.php)/i.test(source.link)?'facebook-numeric':'facebook-handle';
});
const outfile=await fs.open(logPath,'a');
const limited=new Set();
try {
  await Promise.all([...batches].map(async ([lane,items])=>{
    let attempts=0,confirmed=0,gate=0,blank=0;
    const workers=lane==='facebook-page'?2:1;
    let cursor=0;
    await Promise.all(Array.from({length:workers},async()=>{
      for (;;) {
        if (limited.has(items[0].channel)||gate>=6||blank>=18||cursor>=items.length) return;
        const source=items[cursor++];
        let row={sourceKey:source.source_key,originalLink:source.link,channel:source.channel,checkedAt:new Date().toISOString()};
        try {
          const url=new URL(source.link);
          url.protocol='https:';
          const expected=route(url,source.channel);
          if (!allowed(url,source.channel)||!expected) {row.status='UNSUPPORTED_SOURCE_ROUTE';}
          else {
            const page=await getPage(url,source.channel);
            row={...row,status:page.status,url:page.url,httpStatus:page.httpStatus,retryAfter:page.retryAfter};
            if (page.status==='PAGE_READ') {
              const proof=source.channel==='facebook'?facebook(page,expected):other(source,page);
              if (proof?.id||proof?.metricText) row={...row,...proof,status:proof.id?'live':'METRIC_ONLY',url:page.url};
              else row.status='NO_TARGET_METADATA';
            }
          }
        } catch (error) {row.status='READ_ERROR';row.error=error.name;}
        await outfile.appendFile(JSON.stringify(row)+'\n');
        attempts++;
        if (row.status==='live'||row.status==='METRIC_ONLY') confirmed++;
        gate = row.status==='AUTH_REQUIRED'||row.status==='ACCESS_LIMIT' ? gate+1 : 0;
        blank = row.status==='NO_TARGET_METADATA' ? blank+1 : 0;
        if (row.httpStatus===429||row.httpStatus===999) limited.add(source.channel);
        if (attempts%30===0) console.log(lane,{attempts,confirmed,queued:items.length});
        await delay(550);
      }
    }));
    console.log(lane,{attempts,confirmed,queued:items.length,stop:limited.has(items[0].channel)?'PLATFORM_LIMIT':gate>=6?'ACCESS_GATE':blank>=18?'NO_PROFILE_METADATA':'END_OF_QUEUE'});
  }));
} finally {await outfile.close();}
