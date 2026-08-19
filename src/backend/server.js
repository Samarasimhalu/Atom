const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs-extra');
const path = require('path');
const config = require('./config');

// Import core modules
const AITestGenerator = require('./aiTestGenerator');
const MCPExecutor = require('./mcpExecutor');
const TestManager = require('./testManager');
const StreamingService = require('./streamingService');
const {
  createLogger,
  correlationIdMiddleware,
  securityHeaders,
  createRateLimiter,
  authenticate,
  requireTenant,
  denyUnsafeExecution,
  verifyHs256Jwt
} = require('./security');
const {
  validationMiddleware,
  validateGenerationRequest,
  validateExecutionRequest,
  validateSavedTest
} = require('./validation');

const logger = createLogger();
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'X-Tenant-Id', 'X-Dev-User'],
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

// Artifacts are intentionally not served as public filesystem paths. They must be
// delivered through an authorization-aware object-storage service in production.

// Health check endpoint
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

    const result = await aiGenerator.generateTest(prompt, testType, options);
    
    streamingService.sendToChannel(`tenant-${req.tenantId}`, {
      type: 'generation-completed',
      result,
      tenantId: req.tenantId,
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    });

    res.json(result);
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
app.post('/api/execute/test', validationMiddleware(validateExecutionRequest), denyUnsafeExecution(config), async (req, res) => {
  try {
    const { testData, sessionId } = req.validated;

    // Start execution asynchronously
    mcpExecutor.executeTest(testData, sessionId, streamingService)
      .then(result => {
        streamingService.broadcast({
          type: 'execution-completed',
          sessionId,
          result,
          timestamp: new Date().toISOString()
        });
      })
      .catch(error => {
        streamingService.broadcast({
          type: 'execution-error',
          sessionId,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      });

    res.json({ 
      status: 'started',
      sessionId,
      message: 'Test execution started. Monitor via WebSocket for real-time updates.'
    });
  } catch (error) {
    logger.error('test.execution.failed', { correlationId: req.correlationId, tenantId: req.tenantId, error: error.message });
    res.status(500).json({ error: 'execution_failed', correlationId: req.correlationId });
  }
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
app.get('/api/analytics/dashboard', async (req, res) => {
  try {
    const analytics = await testManager.getDashboardAnalytics();
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: error.message });
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
  logger.info('websocket.connected', { userId: ws.userId, tenantId: ws.tenantId });
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      streamingService.handleMessage(ws, data);
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
    streamingService.removeConnection(ws);
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
    server.close(() => process.exit(0));
  });

  process.on('SIGINT', () => {
    logger.info('server.shutdown.requested', { signal: 'SIGINT' });
    server.close(() => process.exit(0));
  });
}

module.exports = { app, server, wss };

