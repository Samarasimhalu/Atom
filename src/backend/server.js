const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

// Import core modules
const AITestGenerator = require('./aiTestGenerator');
const MCPExecutor = require('./mcpExecutor');
const TestManager = require('./testManager');
const StreamingService = require('./streamingService');
const { Persistence } = require('./persistence');
const RunQueue = require('./runQueue');
const ObjectStorage = require('./objectStorage');
const RunService = require('./runService');
const PolicyEngine = require('./policyEngine');
const ApprovalWorkflow = require('./approvalWorkflow');
const EvaluationHarness = require('./evaluationHarness');
const DataLifecycleService = require('./dataLifecycle');
const { normalizeGeneratedTest } = require('./testSpecification');
const { verifyPayload } = require('./signedWebhook');
const {
  createLogger,
  correlationIdMiddleware,
  securityHeaders,
  createRateLimiter,
  authenticate,
  requireTenant,
  requirePermission,
  denyUnsafeExecution,
  validateProductionConfig,
  verifyHs256Jwt
} = require('./security');
const {
  validationMiddleware,
  validateGenerationRequest,
  validateExecutionRequest,
  validateSavedTest
} = require('./validation');

const logger = createLogger();
const productionConfigErrors = validateProductionConfig(config);
if (productionConfigErrors.length) {
  logger.error('startup.production_config_invalid', { errors: productionConfigErrors });
  if (require.main === module) process.exit(1);
}
const app = express();
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Security and request middleware. Authentication is required for all API routes
// except health; development mode only accepts the explicit local identity headers.
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(correlationIdMiddleware(logger));
app.use(securityHeaders);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.auth.allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('origin_not_allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Idempotency-Key', 'X-Correlation-Id', 'X-Tenant-Id', 'X-Project-Id', 'X-Dev-User'],
  credentials: true
}));
app.use(express.json({ limit: config.request.jsonLimit }));
app.use(express.urlencoded({ extended: false, limit: config.request.jsonLimit }));

// Ensure data directories exist
Object.values(config.storage).forEach(dir => {
  fs.ensureDirSync(dir);
});

// Initialize core services
const aiGenerator = new AITestGenerator(config);
const mcpExecutor = new MCPExecutor(config);
const testManager = new TestManager(config);
const streamingService = new StreamingService(wss);
const store = new Persistence(config, logger);
const runQueue = new RunQueue(config, logger);
const objectStorage = new ObjectStorage(config, logger);
const policyEngine = new PolicyEngine(config);
const approvalWorkflow = new ApprovalWorkflow(config, store, logger);
const evaluationHarness = new EvaluationHarness(config, aiGenerator, policyEngine, logger);
const dataLifecycle = new DataLifecycleService({ store, objectStorage, config, logger });
const runService = new RunService({ store, queue: runQueue, executor: mcpExecutor, streaming: streamingService, objectStorage, config, logger, policyEngine });
let retentionTimer;
if (require.main === module) {
  retentionTimer = setInterval(async () => {
    try {
      const expired = await store.listExpiredArtifacts();
      for (const artifact of expired) { await objectStorage.deleteObject(artifact.object_key || artifact.objectKey); await store.markArtifactDeleted(artifact.id); }
      if (expired.length) logger.info('artifacts.retention.cleaned', { count: expired.length });
    } catch (error) { logger.error('artifacts.retention.failed', { error: error.message }); }
  }, 60 * 60 * 1000);
  retentionTimer.unref();
}

// Artifacts are intentionally not served as public filesystem paths. They must be
// delivered through an authorization-aware object-storage service in production.

// Health check endpoint
app.get('/api/readyz', async (req, res) => {
  const checks = {
    persistence: Boolean(config.persistence.mode === 'postgres' ? config.persistence.databaseUrl : true),
    queue: Boolean(config.queue.mode === 'bullmq' ? config.queue.redisUrl : true),
    objectStorage: Boolean(config.objectStorage.mode === 's3' ? config.objectStorage.endpoint && config.objectStorage.bucket : true),
    productionConfig: productionConfigErrors.length === 0
  };
  const ready = Object.values(checks).every(Boolean);
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks, correlationId: req.correlationId });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'SAINT Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    config: {
      environment: config.environment,
      supportedBrowsers: config.browsers,
      maxConcurrentTests: config.mcp.maxConcurrentTests
    }
  });
});

// Authentication, tenant context, and bounded API request rates.
app.use('/api', authenticate(config), requireTenant, createRateLimiter(config.rateLimit));

// Health check is intentionally public and contains no tenant data.

// AI Test Generation Endpoints
app.post('/api/generate/test', createRateLimiter({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.generationMax }), validationMiddleware(validateGenerationRequest), async (req, res) => {
  try {
    const { prompt, testType, options } = req.validated;

    streamingService.sendToChannel(`tenant-${req.tenantId}`, {
      type: 'generation-started',
      prompt,
      testType,
      tenantId: req.tenantId,
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    });

    const result = await aiGenerator.generateTest(prompt, testType, options, { tenantId: req.tenantId, correlationId: req.correlationId });
    
    streamingService.sendToChannel(`tenant-${req.tenantId}`, {
      type: 'generation-completed',
      result,
      tenantId: req.tenantId,
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    });

    const specification = normalizeGeneratedTest(result);
    const policy = policyEngine.evaluate(specification, { tenantId: req.tenantId, userId: req.user.id });
    await store.recordAudit({ tenantId: req.tenantId, actorId: req.user.id, action: 'ai.test_generated', resourceType: 'test', resourceId: result.id, metadata: { correlationId: req.correlationId, policy } });
    res.json({ ...result, specification, policy });
  } catch (error) {
    logger.error('test.generation.failed', { correlationId: req.correlationId, tenantId: req.tenantId, error: error.message });
    
    streamingService.sendToChannel(`tenant-${req.tenantId}`, {
      type: 'generation-error',
      error: 'generation_failed',
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({ error: 'generation_failed', correlationId: req.correlationId });
  }
});

// MCP Test Execution Endpoints. Unsafe execution is denied unless an isolated
// prebuilt worker image is explicitly configured and enabled.
app.post('/api/execute/test', requirePermission('runs:create'), validationMiddleware(validateExecutionRequest), denyUnsafeExecution(config), async (req, res) => {
  try {
    const { testData, sessionId } = req.validated;
    const specification = normalizeGeneratedTest(testData);
    const policy = policyEngine.evaluate(specification, { tenantId: req.tenantId, userId: req.user.id });
    if (!policy.allowed) return res.status(403).json({ error: 'policy_denied', reasons: policy.reasons, correlationId: req.correlationId });
    if (policy.approvalRequired) {
      const approval = req.get('x-approval-id') ? await approvalWorkflow.get(req.get('x-approval-id'), req.tenantId) : null;
      if (!approval || approval.status !== 'approved') return res.status(409).json({ error: 'approval_required', correlationId: req.correlationId });
    }
    const idempotencyKey = req.get('idempotency-key') || req.get('x-idempotency-key');
    if (!idempotencyKey || idempotencyKey.length > 200) return res.status(400).json({ error: 'idempotency_key_required', correlationId: req.correlationId });
    const submission = await runService.submit({ tenantId: req.tenantId, userId: req.user.id, projectId: req.get('x-project-id') || 'default', testData, sessionId, idempotencyKey, correlationId: req.correlationId });
    res.status(submission.replayed ? 200 : 202).json({ status: submission.run.state, run: submission.run, replayed: submission.replayed, sessionId: submission.run.session_id, correlationId: req.correlationId });
  } catch (error) {
    logger.error('test.execution.failed', { correlationId: req.correlationId, tenantId: req.tenantId, error: error.message });
    const status = error.message.includes('quota') ? 429 : 500;
    res.status(status).json({ error: error.message === 'tenant_run_quota_exceeded' ? error.message : 'execution_submission_failed', correlationId: req.correlationId });
  }
});

app.get('/api/runs', requirePermission('runs:read'), async (req, res) => {
  res.json({ runs: await store.listRuns(req.tenantId, Math.min(Number(req.query.limit || 50), 200)) });
});

app.get('/api/runs/:id', requirePermission('runs:read'), async (req, res) => {
  const run = await store.getRun(req.params.id, req.tenantId);
  if (!run) return res.status(404).json({ error: 'run_not_found', correlationId: req.correlationId });
  res.json(run);
});

app.get('/api/runs/:id/events', requirePermission('runs:read'), async (req, res) => {
  const run = await store.getRun(req.params.id, req.tenantId);
  if (!run) return res.status(404).json({ error: 'run_not_found', correlationId: req.correlationId });
  res.json({ events: await runService.replay(req.params.id, req.tenantId, Number(req.query.after || 0)) });
});

app.post('/api/runs/:id/cancel', requirePermission('runs:cancel'), async (req, res) => {
  const run = await runService.cancel(req.params.id, req.tenantId, 'user_requested');
  if (!run) return res.status(404).json({ error: 'run_not_found', correlationId: req.correlationId });
  res.json(run);
});

app.get('/api/audit', requirePermission('audit:read'), async (req, res) => {
  res.json({ events: await store.listAudit(req.tenantId, Math.min(Number(req.query.limit || 100), 500)) });
});

app.get('/api/admin/data/export', requirePermission('admin:privacy'), async (req, res) => {
  const exportRecord = await dataLifecycle.exportTenant(req.tenantId, req.user.id);
  res.json(exportRecord);
});

app.post('/api/admin/data/delete', requirePermission('admin:privacy'), async (req, res) => {
  if (!req.body?.confirm || req.body.confirm !== req.tenantId) return res.status(400).json({ error: 'tenant_confirmation_required', correlationId: req.correlationId });
  const result = await dataLifecycle.deleteTenant(req.tenantId, req.user.id, req.body.reason || 'administrative_request');
  res.json(result);
});

app.get('/api/admin/runtime-attestation', requirePermission('admin:runtime'), (req, res) => {
  const configurationChecksum = crypto.createHash('sha256').update(JSON.stringify({
    environment: config.environment,
    authMode: config.auth.mode,
    persistenceMode: config.persistence.mode,
    queueMode: config.queue.mode,
    objectStorageMode: config.objectStorage.mode,
    workerImage: config.execution.workerImage,
    policy: config.policy,
    modelAllowlist: config.ai.allowedModels
  })).digest('hex');
  res.json({
    commitSha: process.env.GIT_COMMIT_SHA || 'unconfigured',
    apiImageDigest: process.env.API_IMAGE_DIGEST || 'unconfigured',
    workerImageDigest: config.execution.workerImage,
    migrationVersion: process.env.MIGRATION_VERSION || 'unconfigured',
    configurationChecksum,
    policyVersion: process.env.POLICY_VERSION || 'unconfigured',
    modelAllowlist: config.ai.allowedModels,
    productionConfigValid: productionConfigErrors.length === 0,
    correlationId: req.correlationId
  });
});

app.get('/api/dashboard', requirePermission('dashboard:read'), async (req, res) => {
  res.json(await store.getDashboard(req.tenantId));
});

app.post('/api/approvals', requirePermission('runs:approve'), async (req, res) => {
  const run = await store.getRun(req.body.runId, req.tenantId);
  if (!run) return res.status(404).json({ error: 'run_not_found', correlationId: req.correlationId });
  const approval = await approvalWorkflow.request({ tenantId: req.tenantId, runId: run.id, requesterId: req.user.id, policy: req.body.policy || {} });
  res.status(201).json(approval);
});

app.get('/api/approvals', requirePermission('runs:read'), async (req, res) => {
  res.json({ approvals: await approvalWorkflow.list(req.tenantId) });
});

app.post('/api/approvals/:id/decision', requirePermission('runs:approve'), async (req, res) => {
  const approval = await approvalWorkflow.decide(req.params.id, req.tenantId, req.user.id, req.body.decision, req.body.comment || '');
  if (!approval) return res.status(404).json({ error: 'approval_not_found', correlationId: req.correlationId });
  res.json(approval);
});

app.post('/api/evaluations/run', requirePermission('admin:ai'), async (req, res) => {
  const dataset = req.body.dataset || await evaluationHarness.loadDataset(req.body.datasetPath);
  const evaluation = await evaluationHarness.evaluate(dataset);
  await store.recordAudit({ tenantId: req.tenantId, actorId: req.user.id, action: 'ai.evaluation_completed', resourceType: 'evaluation', metadata: evaluation });
  res.status(evaluation.passed ? 200 : 422).json(evaluation);
});

app.post('/api/webhooks/verify', requirePermission('admin:ai'), (req, res) => {
  const body = JSON.stringify(req.body.payload || {});
  const valid = verifyPayload(body, req.get('x-atom-webhook-signature'), config.webhooks.signingSecret, req.get('x-atom-webhook-timestamp'));
  res.json({ valid });
});

// Test Management Endpoints
app.get('/api/tests', async (req, res) => {
  try {
    const tests = await testManager.getAllTests();
    res.json(tests);
  } catch (error) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tests/:id', async (req, res) => {
  try {
    const test = await testManager.getTest(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }
    res.json(test);
  } catch (error) {
    console.error('Error fetching test:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tests', validationMiddleware(validateSavedTest), async (req, res) => {
  try {
    const test = await testManager.saveTest({ ...req.validated, tenantId: req.tenantId, ownerId: req.user.id });
    res.json(test);
  } catch (error) {
    console.error('Error saving test:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/tests/:id', async (req, res) => {
  try {
    await testManager.deleteTest(req.params.id);
    res.json({ message: 'Test deleted successfully' });
  } catch (error) {
    console.error('Error deleting test:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test Results Endpoints
app.get('/api/results', async (req, res) => {
  try {
    const results = await testManager.getAllResults();
    res.json(results);
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/results/:sessionId', async (req, res) => {
  try {
    const result = await testManager.getResult(req.params.sessionId);
    if (!result) {
      return res.status(404).json({ error: 'Result not found' });
    }
    res.json(result);
  } catch (error) {
    console.error('Error fetching result:', error);
    res.status(500).json({ error: error.message });
  }
});

// Analytics and Insights Endpoints
app.get('/api/analytics/dashboard', requirePermission('dashboard:read'), async (req, res) => {
  try {
    const analytics = await testManager.getDashboardAnalytics();
    res.json({ ...analytics, runs: await store.getDashboard(req.tenantId) });
  } catch (error) {
    logger.error('analytics.failed', { correlationId: req.correlationId, error: error.message });
    res.status(500).json({ error: 'analytics_failed', correlationId: req.correlationId });
  }
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : requestUrl.searchParams.get('access_token');
  const claims = verifyHs256Jwt(bearer, config.auth.jwtSecret);
  const devClaims = config.auth.mode === 'development'
    ? { sub: req.headers['x-dev-user'] || 'local-developer', tenant_id: req.headers['x-tenant-id'] || 'local-tenant' }
    : null;
  const identity = claims || devClaims;
  if (!identity?.sub || !identity?.tenant_id) {
    logger.warn('websocket.authentication.failed', { correlationId: req.headers['x-correlation-id'] });
    ws.close(1008, 'authentication_required');
    return;
  }
  ws.tenantId = String(identity.tenant_id);
  ws.userId = String(identity.sub);
  const connectionId = `${ws.userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  ws.connectionId = connectionId;
  streamingService.addConnection(ws, connectionId);
  logger.info('websocket.connected', { userId: ws.userId, tenantId: ws.tenantId, connectionId });
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      streamingService.handleMessage(ws, { ...data, connectionId: data.connectionId || connectionId });
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    logger.info('websocket.closed', { userId: ws.userId, tenantId: ws.tenantId });
    streamingService.removeConnection(connectionId);
  });

  ws.on('error', (error) => {
    logger.error('websocket.error', { userId: ws.userId, tenantId: ws.tenantId, error: error.message });
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connection-established',
    message: 'Connected to SAINT Backend',
    timestamp: new Date().toISOString()
  }));
});

// Error handling middleware. Do not expose raw internal messages to clients.
app.use((error, req, res, next) => {
  logger.error('request.failed', { correlationId: req.correlationId, error: error.message, stack: error.stack });
  res.status(error.message === 'origin_not_allowed' ? 403 : 500).json({
    error: error.message === 'origin_not_allowed' ? 'origin_not_allowed' : 'internal_server_error',
    correlationId: req.correlationId
  });
});

// 404 handler
app.get('/api/artifacts/:id/download', requirePermission('artifacts:read'), async (req, res) => {
  const artifact = await store.getArtifact(req.params.id, req.tenantId);
  if (!artifact) return res.status(404).json({ error: 'artifact_not_found', correlationId: req.correlationId });
  const url = await objectStorage.getSignedDownloadUrl(artifact.objectKey, 300);
  res.json({ url, expiresIn: 300 });
});

app.get('/api/artifacts/local/:key(*)', requirePermission('artifacts:read'), async (req, res) => {
  if (objectStorage.s3) return res.status(404).end();
  const safeKey = objectStorage.safeKey(req.params.key);
  const filePath = objectStorage.resolveLocalPath(safeKey);
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(path.resolve(filePath));
});

app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Start server only when executed directly. Tests and embedding applications
// can import the configured Express app without opening a listener.
if (require.main === module) {
  server.listen(config.port, '0.0.0.0', () => {
    logger.info('server.started', {
      port: config.port,
      environment: config.environment,
      maxConcurrentTests: config.mcp.maxConcurrentTests,
      executionEnabled: config.execution.enabled,
      workerMode: config.execution.workerMode,
      workerImageConfigured: Boolean(config.execution.workerImage)
    });
  });
}

// Graceful shutdown
if (require.main === module) {
  process.on('SIGTERM', () => {
    logger.info('server.shutdown.requested', { signal: 'SIGTERM' });
    server.close(async () => { if (retentionTimer) clearInterval(retentionTimer); await runQueue.close(); await store.close(); process.exit(0); });
  });

  process.on('SIGINT', () => {
    logger.info('server.shutdown.requested', { signal: 'SIGINT' });
    server.close(async () => { if (retentionTimer) clearInterval(retentionTimer); await runQueue.close(); await store.close(); process.exit(0); });
  });
}

module.exports = { app, server, wss };

