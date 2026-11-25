// Bounded index seeks per publisher. Publication clocks are scheduling hints only.
export function selectNewsArticleBatch(db,sites,limit=50,now=Date.now(),{backlogFirst=process.env.NEWS_ARTICLE_BACKLOG_FIRST==='1'}={}){
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('NEWS_INVALID_BATCH_LIMIT');
 const paused=new Set(db.prepare('SELECT host FROM host_limits WHERE next_at>?').all(now).map(r=>r.host));
 const running=new Set(db.prepare("SELECT DISTINCT site FROM tasks WHERE state='running'").all().map(r=>r.site));
 const publishers=[...new Set(sites??db.prepare("SELECT DISTINCT site FROM tasks WHERE role='article' AND state='pending'").all().map(r=>r.site))].filter(s=>!paused.has(s)&&!running.has(s));
 if(backlogFirst){const oldest=db.prepare("SELECT id,created FROM tasks INDEXED BY task_pending_article_site_time WHERE role='article' AND state='pending' AND site=? ORDER BY created,id LIMIT 2");return publishers.flatMap(site=>oldest.all(site)).sort((a,b)=>a.created-b.created||a.id-b.id).slice(0,limit).map(t=>t.id);}
 const recent=db.prepare("SELECT id,created,site,priority,seen_at,published_hint FROM tasks INDEXED BY task_article_recent WHERE role='article' AND state='pending' AND site=? AND priority=? AND seen_at>=? ORDER BY seen_at DESC,id DESC LIMIT 3");
 const publication=db.prepare("SELECT id,created,site,priority,seen_at,published_hint FROM tasks INDEXED BY task_article_publication WHERE role='article' AND state='pending' AND site=? AND published_hint>=? AND published_hint<=? ORDER BY published_hint DESC,seen_at DESC,id DESC LIMIT 2");
 const oldest=db.prepare("SELECT id,created,site,priority,seen_at,published_hint FROM tasks INDEXED BY task_pending_article_site_time WHERE role='article' AND state='pending' AND site=? ORDER BY created,id LIMIT 1");
 const candidates=new Map(),old=[];
 for(const site of publishers){for(const t of [...recent.all(site,80,now-1200000),...recent.all(site,50,now-300000),...publication.all(site,now-1200000,now+300000)])candidates.set(t.id,t);const t=oldest.get(site);if(t)old.push(t);}
 const tier=t=>t.published_hint!==null&&t.published_hint<now-86400000?0:t.published_hint>=now-1200000&&t.published_hint<=now+300000?3:t.published_hint!==null&&t.published_hint<now-1200000?1:t.seen_at>=now-1200000&&t.priority>=80?2:t.seen_at>=now-300000?1:0;
 const order=(a,b)=>tier(b)-tier(a)||(tier(a)===3?(b.published_hint||0)-(a.published_hint||0):0)||b.seen_at-a.seen_at||b.priority-a.priority||b.id-a.id;
 const counts=new Map(),used=new Set(),out=[];
 function add(t){if(!t||used.has(t.id)||(counts.get(t.site)||0)>=2||out.length>=limit)return;out.push(t.id);used.add(t.id);counts.set(t.site,(counts.get(t.site)||0)+1);}
 const fresh=[...candidates.values()].filter(t=>tier(t)>0).sort(order),reserve=limit>1?Math.max(1,Math.floor(limit/20)):0;
 for(const t of fresh){if(out.length>=limit-reserve)break;add(t);}
 // Historical backlog has a small background slice, after urgent/recent work.
 old.sort((a,b)=>a.created-b.created||a.id-b.id);let background=0;
 for(const t of old){if(background>=reserve)break;const n=out.length;add(t);if(out.length>n)background++;}
 for(const t of fresh)add(t);
 for(const t of old)add(t);
 for(const t of [...candidates.values()].sort(order))add(t);
 return out;
}
