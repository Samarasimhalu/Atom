const environment = process.env.NODE_ENV || 'development';

module.exports = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  ai: {
    allowedModels: (process.env.AI_ALLOWED_MODELS || 'gpt-4,gpt-3.5-turbo').split(',').map(value => value.trim()).filter(Boolean),
    defaultModel: process.env.AI_DEFAULT_MODEL || 'gpt-4',
    generationModel: process.env.AI_GENERATION_MODEL || 'gpt-4',
    summaryModel: process.env.AI_SUMMARY_MODEL || 'gpt-3.5-turbo',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 30000),
    maxInputChars: Number(process.env.AI_MAX_INPUT_CHARS || 30000),
    maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 4000),
    dailyTokenBudget: Number(process.env.AI_DAILY_TOKEN_BUDGET || 100000)
  },
  port: Number(process.env.PORT || 3001),
  environment,
  auth: {
    mode: process.env.AUTH_MODE || (environment === 'development' ? 'development' : 'strict'),
    jwtSecret: process.env.JWT_SECRET || '',
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(value => value.trim()).filter(Boolean),
    oidc: {
      issuer: process.env.OIDC_ISSUER || '',
      clientId: process.env.OIDC_CLIENT_ID || '',
      audience: process.env.OIDC_AUDIENCE || '',
      jwksUri: process.env.OIDC_JWKS_URI || '',
      groupClaim: process.env.OIDC_GROUP_CLAIM || 'groups',
      roleMappingJson: process.env.OIDC_ROLE_MAPPING_JSON || '{}',
      requiredMfaClaim: process.env.OIDC_REQUIRED_MFA_CLAIM || ''
    },
    saml: { entryPoint: process.env.SAML_ENTRY_POINT || '', issuer: process.env.SAML_ISSUER || '', cert: process.env.SAML_CERT || '' }
  },
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
    max: Number(process.env.RATE_LIMIT_MAX || 120),
    generationMax: Number(process.env.GENERATION_RATE_LIMIT_MAX || 20)
  },
  request: {
    jsonLimit: process.env.JSON_LIMIT || '2mb'
  },
  persistence: {
    mode: process.env.PERSISTENCE_MODE || (environment === 'production' ? 'postgres' : 'local'),
    databaseUrl: process.env.DATABASE_URL || '',
    poolMax: Number(process.env.DATABASE_POOL_MAX || 10),
    statementTimeoutMs: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS || 30000)
  },
  queue: {
    mode: process.env.QUEUE_MODE || (environment === 'production' ? 'bullmq' : 'local'),
    name: process.env.QUEUE_NAME || 'atom-runs',
    redisUrl: process.env.REDIS_URL || '',
    concurrency: Number(process.env.QUEUE_CONCURRENCY || 2),
    attempts: Number(process.env.QUEUE_ATTEMPTS || 2)
  },
  objectStorage: {
    mode: process.env.OBJECT_STORAGE_MODE || (environment === 'production' ? 's3' : 'local'),
    endpoint: process.env.S3_ENDPOINT || '',
    region: process.env.S3_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET || 'atom-artifacts',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    sse: process.env.S3_SSE || 'AES256',
    localPath: process.env.OBJECT_STORAGE_PATH || './data/object-storage'
  },
  quotas: {
    maxRunsPerTenant: Number(process.env.MAX_RUNS_PER_TENANT || 1000),
    retentionDays: Number(process.env.ARTIFACT_RETENTION_DAYS || 30)
  },
  policy: {
    requireApprovalForTags: (process.env.POLICY_REQUIRE_APPROVAL_TAGS || 'payment,production,destructive').split(',').map(value => value.trim()).filter(Boolean),
    blockedDomains: (process.env.POLICY_BLOCKED_DOMAINS || 'localhost,127.0.0.1,169.254.169.254').split(',').map(value => value.trim()).filter(Boolean),
    maxTimeoutMs: Number(process.env.POLICY_MAX_TIMEOUT_MS || 300000)
  },
  webhooks: {
    signingSecret: process.env.WEBHOOK_SIGNING_SECRET || '',
    deliveryUrl: process.env.WEBHOOK_DELIVERY_URL || '',
    timeoutMs: Number(process.env.WEBHOOK_TIMEOUT_MS || 10000)
  },
  evaluation: {
    datasetPath: process.env.EVAL_DATASET_PATH || './evaluations/dataset.json',
    minimumScore: Number(process.env.EVAL_MINIMUM_SCORE || 0.85)
  },
  mcp: {
    maxConcurrentTests: Number(process.env.MAX_CONCURRENT_TESTS || 5),
    testTimeout: Number(process.env.TEST_TIMEOUT || 300000),
    screenshotOnFailure: true,
    videoRecording: true,
    traceOnFailure: true
  },
  browsers: ['chromium', 'firefox', 'webkit'],
  execution: {
    enabled: process.env.EXECUTION_ENABLED === 'true',
    workerImage: process.env.WORKER_IMAGE || '',
    workerMode: process.env.WORKER_MODE || 'isolated-image',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    retries: 2,
    workers: 4,
    hardTimeoutMs: Number(process.env.EXECUTION_HARD_TIMEOUT_MS || 300000)
  },
  storage: {
    tests: process.env.TEST_STORAGE_PATH || './data/tests',
    results: process.env.RESULT_STORAGE_PATH || './data/results',
    screenshots: process.env.SCREENSHOT_STORAGE_PATH || './data/screenshots',
    videos: process.env.VIDEO_STORAGE_PATH || './data/videos',
    traces: process.env.TRACE_STORAGE_PATH || './data/traces'
  }
};

