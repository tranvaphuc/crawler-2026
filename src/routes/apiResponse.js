/** Stable, sanitized error envelopes shared by the public JSON APIs. */
export function jsonApiError(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.type === 'entity.too.large' ? 413 :
    ['entity.parse.failed','request.aborted','request.size.invalid'].includes(error.type) ? 400 :
    ['encoding.unsupported','charset.unsupported'].includes(error.type) ? 415 : 500;
  res.status(status).json({ status: status===500 ? 'error' : 'invalid_input',
    reason: status===500 ? 'INTERNAL_ERROR' : status===413 ? 'BODY_TOO_LARGE' : status===415 ? 'UNSUPPORTED_ENCODING' : 'INVALID_JSON' });
}
export function setRetryAfter(res, result) {
  const ms = result?.retryAfterMs;
  if (Number.isFinite(ms) && ms>0) res.set('Retry-After',String(Math.ceil(ms/1000)));
}
const statuses = new Set(['ok','partial','unavailable','auth_required','security_checkpoint','rate_limited','proxy_error','error','busy','sort_unavailable']);
export function validateResult(result, content = false) {
  if (!result || !statuses.has(result.status)) throw new Error('INVALID_READER_RESPONSE');
  if (content && (!Array.isArray(result.items) || result.count!==result.items.length || !result.pagination)) throw new Error('INVALID_READER_RESPONSE');
  return result;
}
