import {createHash, randomUUID} from 'node:crypto';

export const CRAWLER_V8_QUEUE_NAME = 'crawler-v8-production';
export const CRAWLER_V8_QUEUE_POLICY = 'bullmq_mongo_fenced_v1';
const READY_STATES = ['pending', 'retry', 'partial'];
const CHANNELS = [
  {name:'facebook-page-source', kind:'source', platform:'facebook', sourceId:/^facebook:page:/},
  {name:'facebook-group-source', kind:'source', platform:'facebook', sourceId:/^facebook:group:/},
  {name:'facebook-user-source', kind:'source', platform:'facebook', sourceId:/^facebook:user:/},
  {name:'threads-source', kind:'source', platform:'threads'},
  {name:'instagram-source', kind:'source', platform:'instagram'},
  {name:'youtube-source', kind:'source', platform:'youtube'},
  {name:'facebook-page-comments', kind:'comments', platform:'facebook', sourceId:/^facebook:page:/},
  {name:'facebook-group-comments', kind:'comments', platform:'facebook', sourceId:/^facebook:group:/},
  {name:'facebook-user-comments', kind:'comments', platform:'facebook', sourceId:/^facebook:user:/},
  {name:'threads-comments', kind:'comments', platform:'threads'},
  {name:'instagram-comments', kind:'comments', platform:'instagram'},
  {name:'youtube-comments', kind:'comments', platform:'youtube'}
];

export function crawlerV8BullJobId(job) {
  const version = [job._id, job.state, new Date(job.nextAt).toISOString(), job.attempts || 0, job.recentPass || 0].join('|');
  return 'v8-' + createHash('sha256').update(version).digest('hex').slice(0, 40);
}

export function crawlerV8BullJobData(job) {
  return {
    mongoJobId: String(job._id),
    kind: job.kind,
    platform: job.platform,
    sourceId: job.sourceId,
    crawlMode: job.crawlMode || 'october-backfill',
    recentPass: job.recentPass || null,
    mongoCreatedAt: job.createdAt || null,
    dueAt: job.nextAt || null
  };
}

export function crawlerV8ChannelQuery(runId, channel, at = new Date()) {
  return {
    runId, kind:channel.kind, platform:channel.platform,
    ...(channel.sourceId ? {sourceId:channel.sourceId} : {}),
    state:{$in:READY_STATES}, nextAt:{$lte:at}
  };
}

export async function seedCrawlerV8BullQueue({collection, queue, runId, at = new Date(), perChannel = 80, maxWaiting = 1600} = {}) {
  const counts = await queue.getJobCounts('waiting', 'delayed', 'paused');
  const waiting = Object.values(counts).reduce((sum, n) => sum + (n || 0), 0);
  if (waiting >= maxWaiting) return {offered:0, waiting, capped:true};
  const remaining = maxWaiting - waiting;
  const lists = await Promise.all(CHANNELS.map(async channel => {
    const rows = await collection.find(crawlerV8ChannelQuery(runId, channel, at), {
      projection:{_id:1,kind:1,platform:1,sourceId:1,crawlMode:1,recentPass:1,createdAt:1,nextAt:1,state:1,attempts:1}
    }).sort({nextAt:1, priority:1}).limit(perChannel).toArray();
    return rows.map(row => ({name:channel.name, data:crawlerV8BullJobData(row), opts:{jobId:crawlerV8BullJobId(row), removeOnComplete:{age:86400,count:100000}, removeOnFail:{age:604800,count:100000}}}));
  }));
  const entries=[];
  while(entries.length<remaining && lists.some(list=>list.length)) for(const list of lists) {
    if(entries.length>=remaining) break;
    if(list.length) entries.push(list.shift());
  }
  if(entries.length) await queue.addBulk(entries);
  return {offered:entries.length, waiting, capped:false};
}

export async function claimCrawlerV8BullJob(collection, bullData, {runId, shardIndex, ownerToken, at=new Date()} = {}) {
  if(!bullData?.mongoJobId || !bullData?.kind || !bullData?.platform) return null;
  return collection.findOneAndUpdate({
    _id:bullData.mongoJobId, runId, kind:bullData.kind, platform:bullData.platform,
    state:{$in:READY_STATES}, nextAt:{$lte:at}
  }, {$set:{state:'running', leaseToken:randomUUID(), workerShard:shardIndex,
    workerOwnerToken:ownerToken, workerClass:bullData.kind==='comments'?'comments':'facebook_source',
    leasedUntil:new Date(at.getTime()+180000), startedAt:at, bullClaimedAt:at,
    queueBackend:CRAWLER_V8_QUEUE_POLICY}, $inc:{attempts:1}}, {returnDocument:'after'});
}

export const CRAWLER_V8_CHANNELS = CHANNELS.map(({name})=>name);
