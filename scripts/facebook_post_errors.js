export class FacebookFeedError extends Error {
  constructor(code, message, { category = 'facebook', retryable = false,
    retryWithDifferentProxy = false, retryAfterMs = null, httpStatus = null,
    stage = null, sourceCode = null } = {}) {
    super(message);
    this.name = 'FacebookFeedError';
    Object.assign(this, { code, category, retryable, retryWithDifferentProxy,
      retryAfterMs, httpStatus, stage, sourceCode, context: null, partialResult: null });
  }

  toJSON() {
    return Object.fromEntries(['name', 'code', 'message', 'category', 'retryable',
      'retryWithDifferentProxy', 'retryAfterMs', 'httpStatus', 'stage', 'sourceCode',
      'context', 'partialResult'].map(key => [key, this[key]]));
  }
}

export function inputError(message) {
  return new FacebookFeedError('INVALID_ARGUMENT', message, { category: 'input' });
}

export function templateError(message, options = {}) {
  return new FacebookFeedError('REQUEST_TEMPLATE_INVALID', message, { category: 'config', ...options });
}

export function classifyTransportError(error, hasProxy) {
  if (error instanceof FacebookFeedError) return error;
  if(/^PROXY_/.test(error.code||''))return new FacebookFeedError(error.code,'Proxy lease or provider operation failed',{category:'proxy',retryable:true,retryAfterMs:error.retryAfterMs||null});
  if (/^(?:UPSTREAM_[A-Z_]+|TLS_VALIDATION_FAILED|UNSAFE_REDIRECT|TOO_MANY_REDIRECTS)$/.test(error.code||'')) {
    return new FacebookFeedError(error.code, 'Anonymous HTTP request failed', {
      category:'network',retryable:['UPSTREAM_TIMEOUT','UPSTREAM_NETWORK_ERROR'].includes(error.code),
      sourceCode:error.code,stage:error.stage||null,
    });
  }
  const timeout = ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNABORTED'].includes(error.code);
  // Only label as proxy failure if the transport failed before CONNECT succeeded.
  const proxyFailed = hasProxy && error.stage === 'proxy_connect';
  return new FacebookFeedError(proxyFailed ? (timeout ? 'PROXY_TIMEOUT' : 'PROXY_CONNECT_FAILED') :
    (timeout ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR'),
  proxyFailed ? 'Could not establish a tunnel through the proxy' :
    'Connection failed; the cause is not confirmed to be the proxy', {
    category: proxyFailed ? 'proxy' : 'network', retryable: true,
    retryWithDifferentProxy: proxyFailed, stage: error.stage ?? null,
    sourceCode: error.code ?? null,
  });
}

function retryAfter(value) {
  if (value == null || value === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

export function responseError(response) {
  const options = { httpStatus: response.status };
  const tunnel = response.proxyConnectStatus;
  if ((tunnel && tunnel !== 200) || response.status === 407) {
    const auth = tunnel === 407 || response.status === 407;
    return new FacebookFeedError(auth ? 'PROXY_AUTH_REQUIRED' : 'PROXY_TUNNEL_REJECTED',
      auth ? 'Proxy authentication failed or is required' : `Proxy rejected CONNECT (${tunnel})`,
      { ...options, category: 'proxy', stage: 'proxy_connect', retryable: true,
        retryWithDifferentProxy: true });
  }
  if (/\/checkpoint(?:[/?]|$)/i.test(response.location ?? '')) {
    return new FacebookFeedError('SECURITY_CHECKPOINT', 'Facebook requires a security check', options);
  }
  if (/\/login(?:[/.?]|$)/i.test(response.location ?? '')) {
    return new FacebookFeedError('AUTH_REQUIRED', 'Facebook requires login', options);
  }
  if (response.status === 200) return null;
  if (response.status === 429) return new FacebookFeedError('FACEBOOK_RATE_LIMITED',
    'Facebook rate limited the request', { ...options, retryable: true,
      retryAfterMs: retryAfter(response.retryAfter) });
  if (response.status === 401) return new FacebookFeedError('AUTH_REQUIRED', 'Facebook requires login', options);
  if (response.status === 403) return new FacebookFeedError('FACEBOOK_ACCESS_DENIED',
    'Facebook denied this request; this does not prove the target is private or missing', options);
  if ([400, 404, 405, 410].includes(response.status)) return templateError(
    `GraphQL endpoint rejected the request (HTTP ${response.status}); check the template`, options);
  if (response.status >= 500) return new FacebookFeedError('FACEBOOK_SERVER_ERROR',
    'Facebook returned a server error', { ...options, retryable: true });
  return new FacebookFeedError('FACEBOOK_HTTP_ERROR', 'Unexpected Facebook HTTP response', options);
}

export function graphqlError(errors, { unknownIsFatal = true } = {}) {
  const messages = errors.map(e => [e.message, e.summary, e.description].filter(Boolean).join(' ')).join(' ');
  if (/checkpoint|security check|kiểm tra bảo mật/i.test(messages)) {
    return new FacebookFeedError('SECURITY_CHECKPOINT', 'Facebook requires a security check');
  }
  if (/log(?:ged)?\s*in|login required|authentication required|đăng nhập/i.test(messages)) {
    return new FacebookFeedError('AUTH_REQUIRED', 'Facebook requires login');
  }
  if (/csrf|fb_dtsg|invalid.{0,30}(?:lsd|token)|token.{0,30}(?:invalid|expired)/i.test(messages)) {
    return new FacebookFeedError('REQUEST_TOKEN_INVALID', 'Request token is invalid or expired', { category: 'config' });
  }
  if (/rate.?limit|too many requests|temporarily blocked|giới hạn.{0,30}(?:yêu cầu|tần suất)/i.test(messages)) {
    return new FacebookFeedError('FACEBOOK_RATE_LIMITED', 'Facebook rate limited the request', { retryable: true });
  }
  if (/(?:invalid|expired).{0,30}cursor|cursor.{0,30}(?:invalid|expired)/i.test(messages)) {
    return new FacebookFeedError('INVALID_CURSOR', 'Facebook rejected the cursor', { category: 'pagination' });
  }
  if (/not found|does not exist|doesn't exist|not available|unavailable|permission|access denied|private|không tồn tại|không khả dụng|không có quyền/i.test(messages)) {
    return new FacebookFeedError('TARGET_UNAVAILABLE',
      'Target is unavailable: it may be missing, private, restricted or inaccessible', { category: 'target' });
  }
  // Optional field failures remain ignorable when a usable feed is present.
  // Without one, an explicit native server failure is retryable, not a
  // permanent generic GraphQL failure or a successful empty timeline.
  if (unknownIsFatal && errors.length && errors.every(e => e.is_transient === true ||
    e.is_transient !== false && /^A server error field_exception occured\. Check server logs for details\.$/.test(e.message || ''))) {
    return new FacebookFeedError('FACEBOOK_SERVER_ERROR', 'Facebook returned a transient GraphQL server error', { category: 'network', retryable: true });
  }
  return errors.length && unknownIsFatal ? new FacebookFeedError('FACEBOOK_GRAPHQL_ERROR',
    'Facebook returned a GraphQL error without a usable feed') : null;
}
