import fs from 'node:fs/promises';

const root = '/opt/crawler-v8/current';
const {MongoClient} = await import(root + '/node_modules/mongodb/lib/index.js');
const {detectedSource} = await import(root + '/src/services/crawlerQueueFlow.js');
const {hasVerifiedSourceReceipt} = await import(root + '/src/services/crawlerV8Policy.js');
const mode = process.env.CATALOG_SOURCE_IMPORT_MODE || 'preview';
const input = JSON.parse(process.env.CATALOG_SOURCE_INPUT || await fs.readFile(process.argv[2],'utf8'));
const batch = 'catalog-active-facebook-review-20261120';
const stageCollection = 'project_refresh_batches';
if (!['preview','apply','verify'].includes(mode) || !Array.isArray(input) || !input.length) {
  throw Error('INVALID_CATALOG_SOURCE_IMPORT_INPUT');
}
const client = new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:8000});
const now = new Date();
await client.connect();
try {
  const db = client.db();
  const sources = db.collection('sources');
  const actions = [];
  const recentRounds = new Map();
  for (const item of input) {
    const {type, nativeId, identityProof, groupPrivacy, projects, originalLinks} = item;
    if (item.platform !== 'facebook' || !['page','user','group'].includes(type) ||
        typeof nativeId !== 'string' || !/^\d{5,25}$/.test(nativeId) ||
        identityProof?.type !== type || identityProof?.nativeId !== nativeId ||
        !/^\d{4}-\d\d-\d\dT/.test(identityProof.checkedAt) || !projects?.length) {
      throw Error('INVALID_SOURCE_RECEIPT');
    }
    const id = 'facebook:' + type + ':' + nativeId;
    const matches = await sources.find({platform:'facebook',nativeId}).toArray();
    const active = matches.filter(row => !row.canonicalSourceId);
    const exact = active.filter(row => row.type === type);
    const result = {id,type,nativeId,projects,privacy:groupPrivacy ?? null};
    if (active.some(row => row.type !== type) || exact.length > 1 || matches.length && !exact.length) {
      actions.push({...result,action:'HOLD_IDENTITY_CONFLICT'});
      continue;
    }
    const existing = exact[0];
    if (mode === 'verify') {
      const queue = 'facebook-' + type + '-source';
      if (!recentRounds.has(queue)) {
        recentRounds.set(queue, await db.collection('flow_source_rounds').find({queue},
          {projection:{_id:1}}).sort({startedAt:-1}).limit(8).map(x=>x._id).toArray());
      }
      const [visit,lastRound] = existing && detectedSource(existing) ? await Promise.all([
        db.collection('flow_jobs').findOne({queue,entityKey:'source:'+existing._id},
          {projection:{state:1},sort:{createdAt:-1}}),
        db.collection('flow_source_round_results').findOne({roundId:{$in:recentRounds.get(queue)},sourceId:existing._id},
          {projection:{outcome:1,finishedAt:1},sort:{finishedAt:-1}})
      ]) : [null,null];
      actions.push({...result,action:existing ? 'VERIFIED_RECORD' : 'MISSING',
        sourceId:existing?._id||id,ready:detectedSource(existing),scheduledAt:existing?.flowLastScheduledAt||null,
        recentJob:visit?.state||null,lastRound:lastRound ? {outcome:lastRound.outcome,at:lastRound.finishedAt}:null,
        projectsLinked:projects.every(p=>existing?.projects?.includes(p)),
        lastSuccessAt:existing?.lastSuccessAt||null});
      continue;
    }
    if (type === 'group' && identityProof.evidence !== 'facebook_visible_group_privacy_and_id') {
      throw Error('GROUP_PRIVACY_PROOF_REQUIRED');
    }
    const candidate = {
      _id:id,platform:'facebook',type,nativeId,name:item.name || null,
      url:'https://www.facebook.com/' + (type === 'group' ? 'groups/' : '') + nativeId,
      eligible:true,blockedReason:null,identityStatus:'verified',identityProof,
      ...(type === 'group' ? {groupPrivacy,groupPrivacyObservedAt:new Date(identityProof.checkedAt)} : {}),
      projects,originalLinks,refreshBatch:batch,importedAt:now,lastAttemptAt:null,lastSuccessAt:null,latestPostAt:null,
      audit:{status:'live',identityEvidence:identityProof.evidence,checkedAt:identityProof.checkedAt}
    };
    if (!detectedSource(candidate) || type !== 'group' && !hasVerifiedSourceReceipt(candidate)) {
      throw Error('SOURCE_REJECTED_BY_EXISTING_FLOW_POLICY');
    }
    if (!existing) {
      if (groupPrivacy === 'private') {
        actions.push({...result,action:'HOLD_PRIVATE_GROUP'});
        continue;
      }
      if (mode === 'apply') {
        const change = await sources.updateOne({_id:id},{$setOnInsert:candidate},{upsert:true});
        if (!change.upsertedCount) {
          actions.push({...result,action:'CONCURRENT_SOURCE_INSERT_RERUN'});
          continue;
        }
      }
      actions.push({...result,action:mode === 'apply' ? 'ADDED' : 'WOULD_ADD'});
      continue;
    }
    const set = {};
    const priorProof = existing.identityProof;
    const allowRestore = existing.eligible && !existing.blockedReason && existing.identityStatus !== 'verified' &&
      (!priorProof?.nativeId || priorProof.nativeId === nativeId && priorProof.type === type);
    if (allowRestore && type !== 'group') {
      set.identityStatus='verified';
      set.identityProof=identityProof;
    }
    if (type==='group' && groupPrivacy &&
        !(new Date(existing.groupPrivacyObservedAt || 0) > new Date(identityProof.checkedAt))) {
      set.groupPrivacy=groupPrivacy;
      set.groupPrivacyObservedAt=new Date(identityProof.checkedAt);
    }
    const already = detectedSource(existing);
    if (mode === 'apply') {
      const backup = db.collection('project_refresh_source_backups');
      await backup.updateOne({_id:batch + ':' + existing._id},
        {$setOnInsert:{batch,sourceId:existing._id,before:existing,createdAt:now}},{upsert:true});
      const filter = {_id:existing._id,nativeId,type,canonicalSourceId:null,
        identityStatus:existing.identityStatus ?? null,blockedReason:existing.blockedReason ?? null};
      const update = {$addToSet:{projects:{$each:projects},originalLinks:{$each:originalLinks}}};
      if (Object.keys(set).length) update.$set=set;
      const change = await sources.updateOne(filter,update);
      if (!change.matchedCount) {
        actions.push({...result,action:'CONCURRENT_SOURCE_CHANGE_RERUN'});
        continue;
      }
    }
    actions.push({...result,sourceId:existing._id,
      action:already ? 'ALREADY_ACTIVE' : detectedSource({...existing,...set})
        ? (mode==='apply'?'RESTORED_RECEIPT':'WOULD_RESTORE_RECEIPT') : 'EXISTING_HELD'});
  }
  const counts = {};
  for (const rest of actions) counts[rest.type+':'+rest.action]=(counts[rest.type+':'+rest.action] || 0)+1;
  const report = {batch,mode,at:now,counts,actions};
  if (mode==='apply') {
    await db.collection(stageCollection).updateOne({_id:batch},{$set:{...report,state:'source_import_verified'}},{upsert:true});
  }
  console.log(JSON.stringify(report));
} finally {
  await client.close();
}
