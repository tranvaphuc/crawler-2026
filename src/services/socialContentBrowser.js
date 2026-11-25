import { createSocialMetricsReader } from './socialMetricsBrowser.js';
import { contentBase, extractContentSnapshot } from './socialContent.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
/** Only public, rendered DOM in our own ephemeral browser; never user's logged-in browser. */
export async function readContentUi(page, target) {
  return page.evaluate(target => {
    const t = el => el?.textContent?.trim() || '', attr = (e,k) => e?.getAttribute(k) || null;
    const bodyText = document.body?.innerText || '';
    const ui = { loginBlocked: false, securityBlocked: /^(?:security check|just a moment|verify you are human|challenge)/i.test(document.title), commentItems: [] };
    ui.loginBlocked = !!document.querySelector('[role="dialog"] input[type="password"]') || /\/(?:login|accounts\/login|checkpoint|challenge)/.test(location.pathname);
    if (target.platform === 'youtube') {
      const initial = globalThis.ytInitialData, meta = initial?.metadata?.channelMetadataRenderer;
      const current = location.pathname.replace(/\/videos\/?$/, '').toLowerCase(), expected = target.sourcePath?.toLowerCase();
      ui.sourceVerified = !!meta?.externalId && (current === expected || [...(meta.ownerUrls || []), meta.vanityChannelUrl, meta.channelUrl].filter(Boolean).some(x => { try { return new URL(x).pathname.toLowerCase() === expected; } catch { return false; } }));
      ui.source = meta ? { id: meta.externalId || null, name: meta.title || null, url: target.url } : null;
      ui.searchKeyword = new URL(location.href).searchParams.get('search_query');
      ui.latestVerified = false; ui.latestEvidence = null;
      const visit = (v,depth=0) => {
        if (!v || typeof v !== 'object' || depth>35) return;
        const f = v.searchFilterRenderer, option = v.item || v;
        const label = f?.label?.simpleText || f?.label?.runs?.map(x=>x.text||'').join('') || option.title || option.label;
        if (f && /^(?:upload date|date uploaded)$/i.test(label || '') && /SELECTED$/.test(f.status || '') && !/UNSELECTED|DISABLED/.test(f.status)) { ui.latestVerified = true; ui.latestEvidence = 'searchFilterRenderer.Upload date.SELECTED'; }
        if (v.sortFilterSubMenuRenderer) for (const item of v.sortFilterSubMenuRenderer.subMenuItems || []) if (item.selected && /upload date|newest|most recent/i.test(item.title || '')) { ui.latestVerified = true; ui.latestEvidence = 'selected_sort_menu.Upload date'; }
        for(const x of Object.values(v)) if(x&&typeof x==='object') visit(x,depth+1);
      };
      visit(initial?.header); visit(initial?.contents?.twoColumnSearchResultsRenderer?.primaryContents);
      ui.videoDates = {};
      for(const card of document.querySelectorAll('ytd-rich-item-renderer,yt-lockup-view-model,ytd-video-renderer')) {
        const link=card.querySelector('a[href*="watch?v="]');let id;try{id=new URL(link.href).searchParams.get('v');}catch{}
        if(id)ui.videoDates[id]=t(card.querySelector('#metadata-line span:last-child')) || null;
      }
      const comments=document.querySelector('ytd-comments#comments');
      ui.commentsDisabled=!!comments && /comments are turned off|comments have been turned off/i.test(t(comments));
      const parseComment = (el,parentId=null) => {
        const time=el.querySelector('#published-time-text a,a[href*="lc="]');let id;
        try { id=new URL(time.href).searchParams.get('lc'); } catch {}
        // No ID means no importable record: never manufacture an ID from text/index.
        if(!id)return null;
        const author=el.querySelector('#author-text'); const authorUrl=author?.href || '';
        const name=t(author);const reply=el.querySelector('#reply-button-end button');
        return {id,postId:target.id,url:`https://www.youtube.com/watch?v=${target.id}&lc=${encodeURIComponent(id)}`,platform:'youtube',type:parentId?'reply':'comment',parentId,
          text:t(el.querySelector('#content-text')),author:{id:authorUrl.match(/\/channel\/(UC[\w-]{22})/)?.[1]||null,username:authorUrl.match(/\/@([^/?]+)/)?.[1]||null,name:name||null},
          createdAt:null,publishedText:t(time)||null,likes:null,replyCount:null};
      };
      for(const thread of comments?.querySelectorAll('ytd-comment-thread-renderer') || []) {
        if(thread.parentElement?.closest('ytd-comment-thread-renderer'))continue;
        const root=thread.querySelector(':scope > #body ytd-comment-view-model,:scope > #comment,:scope > ytd-comment-renderer') || thread.querySelector('ytd-comment-view-model,ytd-comment-renderer');
        const first=parseComment(root || thread);if(first)ui.commentItems.push(first);
        if(target.includeReplies && first)for(const child of thread.querySelectorAll('#replies ytd-comment-view-model,#replies ytd-comment-renderer')){const item=parseComment(child,first.id);if(item)ui.commentItems.push(item);}
      }
    }
    return ui;
  }, { platform: target.platform, operation: target.operation, id: target.id, sourcePath: target.sourcePath, url: target.url, keyword: target.keyword, includeReplies: target.includeReplies });
}
async function advancePublicUi(page, target, clicked) {
  if (target.operation === 'comments') {
    // Click only read-only expansion controls; never Reply/Like/Log in/Share buttons.
    const controls = await page.$$(target.platform==='youtube' ? 'ytd-comments#comments button' : 'button,[role="button"]');
    let count = 0;
    for (const handle of controls) {
      if (count >= 3) break;
      const info = await handle.evaluate(el => ({ label: el.getAttribute('aria-label') || el.textContent?.trim() || '',
        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length), key: el.getAttribute('id') || '' }));
      const expand = /^(?:view|show|load|see)(?:\s+(?:all|more|\d+))?\s+(?:comments?|repl(?:y|ies))\b|^\d+\s+repl(?:y|ies)\b/i.test(info.label) && !/hide|reply to|write|post|send|log in/i.test(info.label);
      if (!expand || !info.visible) continue;
      const key = info.key + ':' + info.label;
      // Same label may appear under several parents: mark the DOM element, not label text.
      const already = await handle.evaluate(el => el.dataset.kompaExpanded === '1'); if (already) continue;
      try { await handle.click(); await handle.evaluate(el => { el.dataset.kompaExpanded = '1'; }); count++; clicked.add(key); } catch { /* Offscreen/removed controls can be retried in another window. */ }
    }
  }
  await page.evaluate(() => {
    window.scrollBy(0, Math.max(800, Math.round(innerHeight * 1.2)));
    const scrollables = Array.from(document.querySelectorAll('[role="dialog"],main,section')).filter(e => e.scrollHeight > e.clientHeight + 300 && /auto|scroll/.test(getComputedStyle(e).overflowY));
    for (const e of scrollables.slice(0,2)) e.scrollTop += Math.max(800,e.clientHeight);
  });
}
export function createSocialContentReader({ getProxy, launch, executablePath, timeoutMs = 60000, settleMs = 3000 } = {}) {
  const blockedUntil = new Map();
  const browserRead = createSocialMetricsReader({ getProxy, launch, executablePath, timeoutMs, settleMs,
    readPage: async ({ target, page, snapshot, deadline }) => {
      let result=contentBase(target), previous=-1, idle=0; const found=new Map(),clicked=new Set();
      const scrollBudget = Math.min(40, 12 + (target.replayPages || 0) * 4);
      for(let step=0;step<=scrollBudget && Date.now()<deadline-1500;step++) {
        const snap=await snapshot(),ui=await readContentUi(page,target);
        result=extractContentSnapshot(target,snap,ui);
        if(['auth_required','security_checkpoint','rate_limited','sort_unavailable','error'].includes(result.status) || result.reason==='SOURCE_OR_POST_UNAVAILABLE') {
          break;
        }
        for(const item of result.items)found.set(item.id,item);
        if(found.size>=target.limit && !(target.operation==='comments' && target.includeReplies && step<3)) { result.pagination.reason='LIMIT_REACHED';break; }
        idle=found.size===previous?idle+1:0;previous=found.size;
        if(idle>=3){result.pagination.reason='NO_NEW_PUBLIC_ITEMS';break;}
        await advancePublicUi(page,target,clicked);await sleep(target.operation==='comments'?1200:900);
        result.pagination.reason='BROWSER_WINDOW_LIMIT';
      }
      if(result.status!=='sort_unavailable') {
        let ordered=[...found.values()];
        if(target.operation==='comments' && target.includeReplies) {
          const children=new Map(),emitted=new Set(),out=[];
          for(const item of ordered)if(item.parentId){if(!children.has(item.parentId))children.set(item.parentId,[]);children.get(item.parentId).push(item);}
          const emit=(item,depth=0)=>{if(emitted.has(item.id)||depth>10)return;emitted.add(item.id);out.push(item);for(const child of children.get(item.id)||[])emit(child,depth+1);};
          for(const item of ordered)if(item.type==='comment')emit(item);
          for(const item of ordered)emit(item);
          ordered=out;
        }
        result.items=ordered.slice(0,target.limit);
      }
      result.count=result.items.length; result.rootComments=result.items.filter(x=>x.type==='comment').length;result.replies=result.items.filter(x=>x.type==='reply').length;
      if(result.count && !['auth_required','security_checkpoint','rate_limited','error','unavailable'].includes(result.status)){result.status='partial';result.reason ||= result.pagination.reason==='BROWSER_WINDOW_LIMIT'?'BROWSER_WINDOW_LIMIT':null;}
      // A stalled scroll is not evidence that a platform has returned every item or reply.
      result.pagination.complete=result.reason==='COMMENTS_DISABLED';
      result.pagination.hasMore=result.pagination.reason==='LIMIT_REACHED'?true:result.pagination.hasMore;
      return result;
    } });
  return async target => {
    const until=blockedUntil.get(target.platform)||0;
    if(Date.now()<until)return {...contentBase(target),status:'rate_limited',reason:'PLATFORM_COOLDOWN',retryAfterMs:until-Date.now()};
    const value=await browserRead(target);
    if(value.status==='rate_limited')blockedUntil.set(target.platform,Date.now()+(value.retryAfterMs||900000));
    if(!Array.isArray(value.items))return {...contentBase(target),status:value.status,reason:value.reason,retryAfterMs:value.retryAfterMs||null,transport:value.transport};
    return value;
  };
}
