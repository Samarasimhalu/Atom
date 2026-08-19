const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

function timingSafeEqualString(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function base64UrlDecode(value) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function verifyHs256Jwt(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || !secret) return null;
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = JSON.parse(base64UrlDecode(encodedHeader).toString('utf8'));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');
    if (!timingSafeEqualString(expected, encodedSignature)) return null;
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    if (payload.nbf && payload.nbf > now) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function createLogger() {
  const write = (level, message, fields = {}) => {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: 'atom-backend',
      message,
      ...fields
    };
    const output = JSON.stringify(entry);
    if (level === 'error') console.error(output);
    else if (level === 'warn') console.warn(output);
    else console.log(output);
  };
  return {
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields)
  };
}

function correlationIdMiddleware(logger) {
  return (req, res, next) => {
    const correlationId = req.get('x-correlation-id') || uuidv4();
    req.correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    const started = Date.now();
    res.on('finish', () => logger.info('request.completed', {
      correlationId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - started,
      userId: req.user?.id,
      tenantId: req.tenantId
    }));
    next();
  };
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

function createRateLimiter({ windowMs = 60_000, max = 120 } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const key = req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    current.count += 1;
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', Math.max(0, max - current.count));
    res.setHeader('RateLimit-Reset', Math.ceil(current.resetAt / 1000));
    if (current.count > max) {
      return res.status(429).json({ error: 'rate_limit_exceeded', correlationId: req.correlationId });
    }
    next();
  };
}

function authenticate(config) {
  return (req, res, next) => {
    const authMode = config.auth.mode;
    const authHeader = req.get('authorization');
    const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    let claims = verifyHs256Jwt(bearer, config.auth.jwtSecret);

    if (!claims && authMode === 'development') {
      const devUser = req.get('x-dev-user') || 'local-developer';
      const devTenant = req.get('x-tenant-id') || 'local-tenant';
      claims = { sub: devUser, tenant_id: devTenant, roles: ['developer'] };
    }

    if (!claims || !claims.sub || !claims.tenant_id) {
      return res.status(401).json({ error: 'authentication_required', correlationId: req.correlationId });
    }
    req.user = { id: String(claims.sub), roles: Array.isArray(claims.roles) ? claims.roles : [] };
    req.tenantId = String(claims.tenant_id);
    next();
  };
}

function requireTenant(req, res, next) {
  if (!req.tenantId) return res.status(403).json({ error: 'tenant_context_required', correlationId: req.correlationId });
  next();
}

const ROLE_PERMISSIONS = {
  viewer: ['runs:read', 'artifacts:read', 'dashboard:read'],
  developer: ['runs:read', 'runs:create', 'runs:cancel', 'artifacts:read', 'dashboard:read'],
  approver: ['runs:read', 'runs:create', 'runs:cancel', 'runs:approve', 'artifacts:read', 'dashboard:read'],
  admin: ['runs:read', 'runs:create', 'runs:cancel', 'runs:approve', 'artifacts:read', 'artifacts:delete', 'audit:read', 'dashboard:read', 'quota:manage', 'admin:ai'],
  owner: ['*']
};

function hasPermission(roles = [], permission) {
  return roles.some(role => ROLE_PERMISSIONS[role]?.includes('*') || ROLE_PERMISSIONS[role]?.includes(permission));
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user?.roles || [], permission)) return res.status(403).json({ error: 'permission_denied', permission, correlationId: req.correlationId });
    next();
  };
}

function denyUnsafeExecution(config) {
  return (req, res, next) => {
    const code = req.body?.testData?.code;
    const unsafeReason = !config.execution.enabled
      ? 'execution_disabled'
      : !config.execution.workerImage
        ? 'worker_image_not_configured'
        : /\b(child_process|execSync|spawn|fork|eval|Function\s*\(|process\.env|fs\.)\b/.test(String(code || ''))
          ? 'unsafe_code_pattern'
          : null;
    if (unsafeReason) {
      return res.status(403).json({ error: 'unsafe_execution_denied', reason: unsafeReason, correlationId: req.correlationId });
    }
    next();
  };
}

module.exports = {
  createLogger,
  correlationIdMiddleware,
  securityHeaders,
  createRateLimiter,
  authenticate,
  requireTenant,
  requirePermission,
  hasPermission,
  denyUnsafeExecution,
  verifyHs256Jwt
};

// Exported for focused unit tests.
module.exports._internals = { timingSafeEqualString, base64UrlDecode };
