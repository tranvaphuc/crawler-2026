import {createSystemInputAdapter,ReferenceError} from '../services/socialSystemReference.js';
import { jsonApiError, setRetryAfter, validateResult } from './apiResponse.js';
import express from 'express';
import { normalizeMetricsInput, SocialMetricsInputError } from '../services/socialMetrics.js';
import { createSocialHttpMetricsReader } from '../services/socialHttpReaders.js';
import {createApiRequestGate} from '../services/apiRequestGate.js';
import {apiAwait,throwIfApiAborted} from '../services/apiRequestContext.js';

export function createSocialMetricsRouter({ read = createSocialHttpMetricsReader(), maxConcurrent = 2, prepareInput=createSystemInputAdapter(),requestGate=createApiRequestGate({name:'metrics',maxConcurrent}) } = {}) {
  const router = express.Router();
  router.post('/api/social/post/metrics', express.json({ limit: '12kb' }), requestGate.wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let target;
    try { target = normalizeMetricsInput(await apiAwait(prepareInput(req.body,'metrics'))); }
    catch (error) {
      throwIfApiAborted();
      if(error instanceof ReferenceError){setRetryAfter(res,error);return res.status(error.status).json({status:error.resultStatus||(error.status>=500?'error':[404,422].includes(error.status)?'unavailable':'invalid_input'),retryAfterMs:error.retryAfterMs||null,reason:error.message});}
      if (error instanceof SocialMetricsInputError || error.name === 'FacebookShareInputError') return res.status(400).json({ status: 'invalid_input', reason: error.message });
      return res.status(400).json({ status: 'invalid_input', reason: 'Invalid post URL' });
    }
    try { const result = validateResult(await apiAwait(read(target))); setRetryAfter(res,result); return res.json({...result,link:req.body.link??null,url:req.body.url??null,inputId:req.body.id??null}); }
    catch { throwIfApiAborted();return res.status(500).json({ link: target.link, url: target.originalUrl, status: 'error', reason: 'INTERNAL_ERROR' }); }
  }));
  router.use(jsonApiError);
  return router;
}
