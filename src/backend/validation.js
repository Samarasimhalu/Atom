const ALLOWED_TEST_TYPES = new Set(['ui', 'api', 'visual', 'mixed']);
const ALLOWED_BROWSERS = new Set(['chromium', 'firefox', 'webkit']);
const ALLOWED_ARTIFACT_MODES = new Set(['off', 'on', 'only-on-failure', 'retain-on-failure', 'on-first-retry']);

function fail(message, field) {
  const error = new Error(message);
  error.code = 'validation_error';
  error.field = field;
  return error;
}

function assertPlainObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(`${field} must be an object`, field);
}

function validateOptions(options = {}) {
  assertPlainObject(options, 'options');
  if (options.browser && !ALLOWED_BROWSERS.has(options.browser)) throw fail('Unsupported browser', 'options.browser');
  if (options.timeout !== undefined && (!Number.isInteger(options.timeout) || options.timeout < 1000 || options.timeout > 300000)) throw fail('Timeout must be an integer between 1000 and 300000 ms', 'options.timeout');
  if (options.retries !== undefined && (!Number.isInteger(options.retries) || options.retries < 0 || options.retries > 5)) throw fail('Retries must be an integer between 0 and 5', 'options.retries');
  if (options.workers !== undefined && (!Number.isInteger(options.workers) || options.workers < 1 || options.workers > 8)) throw fail('Workers must be an integer between 1 and 8', 'options.workers');
  if (options.viewport !== undefined) {
    assertPlainObject(options.viewport, 'options.viewport');
    for (const key of ['width', 'height']) {
      if (!Number.isInteger(options.viewport[key]) || options.viewport[key] < 320 || options.viewport[key] > 4096) throw fail(`Viewport ${key} is invalid`, `options.viewport.${key}`);
    }
  }
  for (const key of ['screenshot', 'video', 'trace']) {
    if (options[key] !== undefined && !ALLOWED_ARTIFACT_MODES.has(options[key])) throw fail(`Unsupported ${key} mode`, `options.${key}`);
  }
  return options;
}

function validateGenerationRequest(body) {
  assertPlainObject(body, 'body');
  if (typeof body.prompt !== 'string' || body.prompt.trim().length < 3 || body.prompt.length > 12000) throw fail('Prompt must be between 3 and 12000 characters', 'prompt');
  const testType = body.testType || 'ui';
  if (!ALLOWED_TEST_TYPES.has(testType)) throw fail('Unsupported test type', 'testType');
  return { prompt: body.prompt.trim(), testType, options: validateOptions(body.options || {}) };
}

function validateTestData(testData) {
  assertPlainObject(testData, 'testData');
  if (typeof testData.code !== 'string' || testData.code.length < 20 || testData.code.length > 200000) throw fail('Test code must be between 20 and 200000 characters', 'testData.code');
  if (testData.id !== undefined && (typeof testData.id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(testData.id))) throw fail('Invalid test ID', 'testData.id');
  if (testData.testType && !ALLOWED_TEST_TYPES.has(testData.testType)) throw fail('Unsupported test type', 'testData.testType');
  if (testData.mcpConfig) validateOptions(testData.mcpConfig);
  return testData;
}

function validateExecutionRequest(body) {
  assertPlainObject(body, 'body');
  if (typeof body.sessionId !== 'string' || !/^[a-zA-Z0-9_-]{8,120}$/.test(body.sessionId)) throw fail('Invalid session ID', 'sessionId');
  validateTestData(body.testData);
  return body;
}

function validateSavedTest(body) {
  validateTestData(body);
  if (body.prompt !== undefined && (typeof body.prompt !== 'string' || body.prompt.length > 12000)) throw fail('Invalid prompt', 'prompt');
  return body;
}

function validationMiddleware(validator) {
  return (req, res, next) => {
    try {
      req.validated = validator(req.body);
      next();
    } catch (error) {
      if (error.code === 'validation_error') return res.status(400).json({ error: error.code, message: error.message, field: error.field, correlationId: req.correlationId });
      next(error);
    }
  };
}

module.exports = {
  validateGenerationRequest,
  validateExecutionRequest,
  validateSavedTest,
  validationMiddleware
};
