const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { OidcVerifier, mapGroupsToRoles } = require('./identityProvider');

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
  const oidcVerifier = config.auth.mode === 'oidc' ? new OidcVerifier(config) : null;
  return async (req, res, next) => {
    try {
      const authMode = config.auth.mode;
      const authHeader = req.get('authorization');
      const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (authMode === 'saml') return res.status(503).json({ error: 'saml_not_supported', correlationId: req.correlationId });
      let claims = authMode === 'oidc' ? await oidcVerifier.verify(bearer) : verifyHs256Jwt(bearer, config.auth.jwtSecret);
      if (authMode === 'oidc') claims = mapGroupsToRoles(claims, config.auth.oidc);

      if (!claims && authMode === 'development') {
        const devUser = req.get('x-dev-user') || 'local-developer';
        const devTenant = req.get('x-tenant-id') || 'local-tenant';
        claims = { sub: devUser, tenant_id: devTenant, roles: ['developer'] };
      }

      if (!claims || !claims.sub || !claims.tenant_id || (authMode === 'oidc' && (!Array.isArray(claims.roles) || claims.roles.length === 0))) {
        return res.status(401).json({ error: 'authentication_required', correlationId: req.correlationId });
      }
      req.user = { id: String(claims.sub), roles: Array.isArray(claims.roles) ? claims.roles : [] };
      req.tenantId = String(claims.tenant_id);
      next();
    } catch (error) {
      return res.status(401).json({ error: 'authentication_failed', reason: error.message, correlationId: req.correlationId });
    }
  };
}

function requireTenant(req, res, next) {
  if (!req.tenantId) return res.status(403).json({ error: 'tenant_context_required', correlationId: req.correlationId });
  next();
}

const ROLE_PERMISSIONS = {
  viewer: ['runs:read', 'artifacts:read', 'dashboard:read'],
  developer: ['runs:read', 'runs:create', 'runs:cancel', 'artifacts:read', 'dashboard:read', 'ai:generate'],
  approver: ['runs:read', 'runs:create', 'runs:cancel', 'runs:approve', 'artifacts:read', 'dashboard:read', 'ai:generate'],
  admin: ['runs:read', 'runs:create', 'runs:cancel', 'runs:approve', 'artifacts:read', 'artifacts:delete', 'audit:read', 'dashboard:read', 'quota:manage', 'admin:ai', 'admin:runtime', 'admin:privacy', 'ai:generate'],
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

function validateProductionConfig(config) {
  if (config.environment !== 'production') return [];
  const errors = [];
  const placeholder = value => !value || /replace-with|change-me|example\.com|localhost/.test(String(value));
  if (config.auth.mode !== 'oidc') errors.push('production_auth_mode_must_be_oidc');
  if (config.auth.mode === 'oidc' && (placeholder(config.auth.oidc.issuer) || placeholder(config.auth.oidc.audience) || placeholder(config.auth.oidc.jwksUri))) errors.push('oidc_provider_not_configured');
  if (placeholder(config.auth.jwtSecret)) errors.push('jwt_secret_not_configured');
  if (config.auth.allowedOrigins.some(origin => /localhost|127\.0\.0\.1|\*/.test(origin))) errors.push('insecure_cors_origin');
  if (config.persistence.mode !== 'postgres' || !config.persistence.databaseUrl) errors.push('postgres_persistence_required');
  if (!config.persistence.tlsRequired) errors.push('database_tls_required');
  if (config.queue.mode !== 'bullmq' || !config.queue.redisUrl) errors.push('durable_queue_required');
  if (!String(config.queue.redisUrl || '').startsWith('rediss://')) errors.push('redis_tls_required');
  if (config.objectStorage.mode !== 's3' || !config.objectStorage.endpoint || !config.objectStorage.bucket || !config.objectStorage.accessKeyId || !config.objectStorage.secretAccessKey) errors.push('private_object_storage_required');
  if (!String(config.objectStorage.endpoint || '').startsWith('https://')) errors.push('object_storage_tls_required');
  if (!config.objectStorage.publicAccessBlocked || !config.objectStorage.versioningEnabled || !config.objectStorage.lifecyclePolicyId) errors.push('object_storage_security_baseline_required');
  if (!config.objectStorage.kmsKeyId) errors.push('object_storage_kms_key_required');
  if (config.features?.legacyTestApi) errors.push('legacy_test_api_not_supported_in_production');
  if (config.execution.enabled) {
    if (!config.execution.workerImage || !/@sha256:[a-f0-9]{64}$/.test(config.execution.workerImage)) errors.push('immutable_worker_digest_required');
    if (config.execution.networkMode !== 'none' && (!config.execution.egressProxyUrl || !config.policy.allowedDomains.length)) errors.push('managed_egress_proxy_and_target_allowlist_required');
  }
  if (!config.webhooks.signingSecret) errors.push('webhook_signing_secret_required');
  return errors;
}

function denyUnsafeExecution(config) {
  return (req, res, next) => {
    const code = req.body?.testData?.code;
    const testType = req.body?.testData?.testType || req.body?.testData?.mcpConfig?.type;
    const apiPlan = req.body?.testData?.apiPlan || req.body?.testData?.apiTestPlan;
    const managedEgressConfigured = config.execution.networkMode !== 'none'
      && Boolean(config.execution.egressProxyUrl)
      && Array.isArray(config.policy.allowedDomains)
      && config.policy.allowedDomains.length > 0;
    const unsafeReason = !config.execution.enabled
      ? 'execution_disabled'
      : !config.execution.workerImage
        ? 'worker_image_not_configured'
        : testType === 'mobile'
          ? 'mobile_execution_not_supported_by_worker'
          : apiPlan && !managedEgressConfigured
          ? 'api_execution_requires_managed_egress'
          : config.execution.networkMode !== 'none' && !managedEgressConfigured
            ? 'managed_egress_not_configured'
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
  validateProductionConfig,
  verifyHs256Jwt
};

// Exported for focused unit tests.
module.exports._internals = { timingSafeEqualString, base64UrlDecode };
