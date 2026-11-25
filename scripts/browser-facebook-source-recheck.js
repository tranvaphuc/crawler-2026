/* Install in a Facebook tab only after the user explicitly chooses this method.
 * Reads source metadata with same-origin GET requests. Does not read cookies,
 * export HTML, submit Facebook forms, or modify Facebook data.
 * Queue: [{index, keys, originalLink, url}]. Choose a local JSON queue with
 * KompaSourceAudit.chooseAndRun(); inspect KompaSourceAudit.summary(); export
 * public source records with KompaSourceAudit.download().
 */
(() => {
  'use strict';
  const origin = globalThis.location?.origin;
  const state = {records:[], total:0, next:0, active:0, running:false, stopped:false, reason:'', retryAt:null};
  const cache = new Map();
  const controllers = new Set();
  function sourceUrl(input) {
    try {
      let u = new URL(input, origin);
      for(let i=0;i<3 && /\/(?:login|checkpoint)\.php$/i.test(u.pathname) && u.searchParams.has('next');i++){
        const next=new URL(u.searchParams.get('next'),origin);
        if(!/(^|\.)(facebook\.com|fb\.com)$/i.test(next.hostname))return null;
        u=next;
      }
      if (!/(^|\.)(facebook\.com|fb\.com)$/i.test(u.hostname)) return null;
      u.protocol = 'https:';
      u.host = new URL(origin).host;
      u.hash = '';
      return u.href;
    } catch { return null; }
  }
  function actor(u) {
    if (!u?.id || !u.name || /^(?:Facebook User|Facebook user)$/i.test(u.name)) return null;
    const id = u.is_additional_profile_plus === false ? u.id : u.delegate_page?.id || (u.__typename === 'Page' ? u.id : null);
    return {name:u.name, id:id ? String(id) : null, profileId:u.__typename === 'Page' ? null : String(u.id), type:u.is_additional_profile_plus === false ? 'user' : u.delegate_page?.id || u.__typename === 'Page' ? 'page' : '', url:u.url || null};
  }
  function payloadIdentity(query, result) {
    const d = result?.data;
    if (!d) return null;
    if (/ProfileCometHeaderQuery/.test(query)) {
      const u = d.user?.profile_header_renderer?.user;
      const a = actor(u);
      if (a) return {kind:'profile', ...a};
    }
    if (/Groups.*(?:Root|Header).*Query/.test(query)) {
      const g = d.group || (d.node?.__typename === 'Group' ? d.node : null);
      if (g?.id && g.name) return {kind:'group', name:g.name, id:String(g.id), type:'group', url:g.url || null};
    }
    if (/SinglePost(?:Root|DialogContent)Query/.test(query)) {
      const story = d.node_v2 || (d.node?.__typename === 'Story' ? d.node : d.story?.__typename === 'Story' ? d.story : null);
      const u = story?.actors?.[0] || story?.comet_sections?.context_layout?.story?.actors?.[0];
      const a = actor(u);
      if (a) return {kind:'author', ...a};
    }
    if (/Video.*Permalink.*Query/.test(query)) {
      const video = d.video || (d.node?.__typename === 'Video' ? d.node : null);
      const a = actor(video?.owner);
      if (a) return {kind:'author', ...a};
    }
    return null;
  }
  function walk(v, fn) {
    if (!v || typeof v !== 'object') return;
    fn(v);
    for (const child of Object.values(v)) if (child && typeof child === 'object') walk(child, fn);
  }
  function metadata(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const entries = [];
    for (const script of doc.querySelectorAll('script[type="application/json"]')) {
      let data;
      try { data = JSON.parse(script.textContent); } catch { continue; }
      walk(data, v => {
        if (Array.isArray(v) && v[0] === 'RelayPrefetchedStreamCache' && v[1] === 'next') {
          const args = v[3];
          if (typeof args?.[0] === 'string' && args[1]?.__bbox?.result) entries.push({query:args[0], result:args[1].__bbox.result});
        }
      });
    }
    const matches = entries.map(e=>payloadIdentity(e.query,e.result)).filter(m=>m?.name);
    for(const e of entries) if(/Video.*Permalink.*Query/.test(e.query) && JSON.stringify(e.result.path)==='["video","story","attachments",0,"media"]'){
      const owner=actor(e.result.data?.owner);
      if(owner)matches.push({kind:'author',...owner});
    }
    const primary = matches.find(m=>m.kind === 'profile' || m.kind === 'group');
    if (primary) return {...primary, status:'live', identityEvidence:'Authenticated same-origin HTML primary profile/group query'};
    const author = matches.find(m=>m.kind === 'author');
    if (author) return {...author, status:'chưa xác định', identityEvidence:'Authenticated primary post/video author; source page needs verification'};
    const videoOwnerEntry=entries.find(e=>/Video.*Permalink.*Query/.test(e.query) && JSON.stringify(e.result.path)==='["video","story","attachments",0,"media"]' && e.result.data?.owner?.id);
    if(videoOwnerEntry)return {kind:'redirectSource',url:origin+'/'+String(videoOwnerEntry.result.data.owner.id)};
    const deferred = {};
    for (const e of entries) if (/ProfileCometHeaderQuery/.test(e.query) && JSON.stringify(e.result.path) === '["user","profile_header_renderer","user"]') Object.assign(deferred, e.result.data);
    if (deferred.name) return {kind:'profile', ...actor(deferred), name:deferred.name, status:'live', identityEvidence:'Authenticated deferred primary profile header; unverified ID remains blank'};
    return null;
  }
  function stop(reason='Stopped by user') {
    state.stopped = true;
    state.reason = reason;
    for (const c of controllers) c.abort();
  }
  async function get(url) {
    const safe = sourceUrl(url);
    if (!safe) throw new Error('SOURCE_OUTSIDE_FACEBOOK');
    if (state.stopped) throw new Error('STOPPED');
    const c = new AbortController();
    controllers.add(c);
    const timer = setTimeout(()=>c.abort(), 15000);
    try {
      const r = await fetch(safe, {credentials:'same-origin', headers:{Accept:'text/html'}, signal:c.signal});
      const end = new URL(r.url);
      if (end.origin !== origin) throw new Error('EXTERNAL_REDIRECT_NOT_READ');
      if (r.status === 429) {
        const retry = r.headers.get('Retry-After');
        state.retryAt = retry && /^\d+$/.test(retry) ? new Date(Date.now()+Number(retry)*1000).toISOString() : retry || null;
        stop('RATE_LIMITED; respect Retry-After before a manual resume');
        throw new Error('RATE_LIMITED');
      }
      if (r.status === 401 || r.status === 403 || /\/(?:login|checkpoint|recover)(?:\/|\.php|$)/i.test(end.pathname)) {
        const reason='AUTH_OR_SECURITY_REQUIRED_HTTP_'+r.status+( /\/checkpoint(?:\/|$)/i.test(end.pathname)?'_CHECKPOINT': /\/(?:login|recover)(?:\/|\.php|$)/i.test(end.pathname)?'_LOGIN_REDIRECT':'');
        stop(reason);
        throw new Error(reason);
      }
      if (!r.ok) throw new Error('HTTP_' + r.status);
      const identity = metadata(await r.text());
      if (identity) return identity;
      // A server redirect can expose the owner even when the post itself is unavailable.
      // Treat the route as a candidate and verify the owner's own profile before accepting it.
      const owner = end.pathname.match(/^\/([^/]+)\/(?:posts|videos|photos|reels)\//);
      if (owner && !['groups','watch','share'].includes(owner[1])) return {kind:'redirectSource',url:origin+'/'+owner[1]};
      return null;
    } finally { clearTimeout(timer); controllers.delete(c); }
  }
  function target(row) {
    const normalized=sourceUrl(row.originalLink || row.url);
    if(!normalized)return null;
    const u = new URL(normalized);
    const p = u.pathname.split('/').filter(Boolean);
    // Story routes expose an owner candidate. Verify that profile directly;
    // do not request an expired/private story or treat the candidate as a Page ID.
    if(p[0]==='stories' && /^\d+$/.test(p[1]||''))return sourceUrl('/'+p[1]);
    if (p[0] === 'groups' && p[1]) return sourceUrl('/groups/'+p[1]+'/');
    if (p.length > 2 && ['posts','videos','photos','reels'].includes(p[1])) return sourceUrl('/'+p[0]);
    if (/^(?:story|permalink|photo)\.php$/.test(p[0] || '') && u.searchParams.has('id')) return sourceUrl('/profile.php?id='+u.searchParams.get('id'));
    // A numeric pair may mean source_post OR post_comment. Keep the original.
    if (/^\d+_\d+$/.test(p[0] || '')) return sourceUrl(u.href);
    return sourceUrl(row.url || row.originalLink);
  }
  async function resolve(row) {
    const first = target(row);
    if (!first) throw new Error('INVALID_SOURCE_URL');
    let result = await get(first);
    if (result?.kind === 'author' || result?.kind === 'redirectSource') {
      const url = sourceUrl(result.url || '/'+(result.profileId || result.id));
      if (url && url !== first) {
        if (!cache.has(url)) cache.set(url, get(url).catch(()=>null));
        const verified = await cache.get(url);
        if (verified?.kind === 'profile' || verified?.kind === 'group') result = verified;
      }
    }
    if (!result?.name) return {status:'chưa xác định', note:'Phiên Facebook hiện tại chưa trả định danh source để xác minh; không kết luận die.'};
    const id = result.id || null;
    return {name:result.name, id, type:result.type || '', status:result.status, url:id ? origin+'/'+id : result.url || first, note:result.status === 'live' ? id ? 'Đã xác minh bằng HTML trong phiên Facebook đang đăng nhập.' : 'Profile tồn tại trong phiên đăng nhập; chưa xác minh numeric ID/loại tài khoản.' : 'Đã xác định tác giả bài/video; chưa xác minh source còn truy cập được.', identityEvidence:result.identityEvidence};
  }
  async function run(queue, concurrency=3) {
    if (!origin || !/^https:\/\/(?:www\.)?facebook\.com$/.test(origin)) throw new Error('Run only in a Facebook tab');
    if (state.running) throw new Error('An audit is already running');
    if (!Array.isArray(queue)) throw new Error('Queue must be a JSON array');
    state.total = queue.length; state.next = 0; state.running = true; state.stopped = false; state.reason = ''; state.records = [];
    cache.clear();
    try {
      await Promise.all(Array.from({length:Math.max(1,Math.min(3,Number(concurrency)||1))},async()=>{
        while (!state.stopped && state.next < queue.length) {
          const row = queue[state.next++]; state.active++;
          try {
            const result = await resolve(row);
            state.records.push({index:row.index, keys:row.keys, channel:'Facebook', originalLink:row.originalLink, ...result, checkedAt:new Date().toISOString(), browserMethod:'authenticated same-origin HTML GET'});
          } catch (e) {
            state.records.push({index:row.index, keys:row.keys, channel:'Facebook', originalLink:row.originalLink, status:'chưa xác định', note:'Browser read: '+e.message, checkedAt:new Date().toISOString(), browserMethod:'authenticated same-origin HTML GET'});
          } finally { state.active--; if(state.records.length && state.records.length%250===0)download(); }
        }
      }));
    } finally { state.running = false; if(state.records.length)download(); console.log('FACEBOOK_FOLLOWUP_FINISHED',JSON.stringify(summary())); }
    return summary();
  }
  function summary() { return {total:state.total, checked:state.records.length, active:state.active, unstarted:Math.max(0,state.total-state.next), running:state.running, stopped:state.stopped, reason:state.reason, retryAt:state.retryAt}; }
  function chooseAndRun() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async()=>{
      if (input.files?.[0]) await run(JSON.parse(await input.files[0].text()));
    };
    input.click();
  }
  function download() {
    const blob = new Blob([state.records.map(r=>JSON.stringify(r)).join('\n')+'\n'],{type:'application/x-ndjson'});
    const href = URL.createObjectURL(blob), a = document.createElement('a'); a.href = href; a.download = 'facebook-followup-recheck.jsonl'; a.click(); setTimeout(()=>URL.revokeObjectURL(href),10000);
  }
  globalThis.KompaSourceAudit = {run, chooseAndRun, stop, summary, download, _payloadIdentity:payloadIdentity, _sourceUrl:sourceUrl, _target:target};
})();
