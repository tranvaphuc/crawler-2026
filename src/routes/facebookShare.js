import { createFacebookHttpReaders } from '../services/facebookHttpReader.js';
import express from 'express';
import { checkFacebookPostShare, getFacebookPostDetails, FacebookShareInputError } from '../services/facebookShare.js';
import { facebookPostsToEs5, FacebookEs5Error } from '../services/facebookEs5.js';
import {createApiRequestGate} from '../services/apiRequestGate.js';
import {apiAwait,throwIfApiAborted} from '../services/apiRequestContext.js';

export function createFacebookShareRouter(options = {}) {
  const defaults=createFacebookHttpReaders();
  const {check=defaults.check,details=defaults.details,maxConcurrent=4,requestGate=createApiRequestGate({name:'facebook_details_share',maxConcurrent})}=options;
  const router = express.Router();
  router.post(['/api/facebook/post/share', '/api/facebook/post/details'], express.json({ limit: '8kb', strict: true }), requestGate.wrap(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const fields = ['input', 'url', 'id'].filter(key => Object.prototype.hasOwnProperty.call(req.body || {}, key));
    if (fields.length !== 1 || typeof req.body[fields[0]] !== 'string') {
      return res.status(400).json({ ok: false, error: 'INVALID_INPUT', message: 'Provide exactly one string field: input, url or id.' });
    }
    try {
      const action = req.path.endsWith('/details') ? details : check;
      if (req.body.format !== undefined && req.body.format !== 'es5') throw new FacebookEs5Error('Unsupported output format');
      if (req.body.format === 'es5' && !req.path.endsWith('/details')) throw new FacebookEs5Error('ES5 format is supported on /details');
      const result = await apiAwait(action(req.body[fields[0]]));
      if (!result || typeof result.ok !== 'boolean' || typeof result.status !== 'string') throw new Error('INVALID_READER_RESPONSE');
      if (result.reason === 'RATE_LIMITED') {
        const raw=String(result.retryAfter || ''), seconds=/^[0-9]+$/.test(raw) ? Number(raw) : Math.ceil((Date.parse(raw)-Date.now())/1000);
        res.set('Retry-After',String(Number.isFinite(seconds)&&seconds>0 ? seconds : 900));
      }
      if (req.body.format === 'es5') {
        if (!req.path.endsWith('/details')) throw new FacebookEs5Error('ES5 format is supported on /details');
        if (!result.ok || !result.post) return res.json({ ok: false, status: result.status, reason: result.reason, transport:result.transport, retryAfter: result.retryAfter || null, format: 'es5', documents: [], rejected: [{ reason: result.reason }], warnings: [] });
        const source = req.body.source || (result.post.pageId ? { type: 'page', id: result.post.pageId, name: result.post.author } :
          result.post.ownerIdType === 'user' ? { type: 'user', id: result.post.ownerId, name: result.post.author } : null);
        if (!source) throw new FacebookEs5Error('Provide source {type,id,name}; source type cannot be inferred safely');
        return res.json({...facebookPostsToEs5([result.post], { source, flow: 'detail' }),transport:result.transport});
      }
      return res.json(result);
    }
    catch (error) {
      throwIfApiAborted();
      if (error instanceof FacebookShareInputError || error instanceof FacebookEs5Error) return res.status(400).json({ ok: false, error: 'INVALID_INPUT', message: error.message });
      return next(error);
    }
  }));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    return res.status(status).json({ ok: false, error: status === 413 ? 'BODY_TOO_LARGE' : status === 400 ? 'INVALID_JSON' : 'INTERNAL_ERROR' });
  });
  return router;
}
