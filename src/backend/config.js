const environment = process.env.NODE_ENV || 'development';

module.exports = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  port: Number(process.env.PORT || 3001),
  environment,
  auth: {
    mode: process.env.AUTH_MODE || (environment === 'development' ? 'development' : 'strict'),
    jwtSecret: process.env.JWT_SECRET || '',
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(value => value.trim()).filter(Boolean)
  },
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
    max: Number(process.env.RATE_LIMIT_MAX || 120),
    generationMax: Number(process.env.GENERATION_RATE_LIMIT_MAX || 20)
  },
  request: {
    jsonLimit: process.env.JSON_LIMIT || '2mb'
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

