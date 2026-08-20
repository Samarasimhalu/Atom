const { validateApiTestPlan } = require('./apiTestPlan');
const TEST_TYPES = new Set(['ui', 'api', 'visual', 'mixed']);
const BROWSERS = new Set(['chromium', 'firefox', 'webkit']);
const SPECIFICATION_VERSION = '1.0';
const SUPPORTED_SPECIFICATION_VERSIONS = new Set([SPECIFICATION_VERSION]);

function validateTestSpecification(input) {
  const spec = {
    schemaVersion: String(input.schemaVersion || SPECIFICATION_VERSION),
    id: input.id,
    name: String(input.name || '').trim(),
    purpose: String(input.purpose || input.prompt || '').trim(),
    type: input.type || input.testType || 'ui',
    target: { url: String(input.target?.url || input.url || '').trim(), environment: input.target?.environment || 'development' },
    browser: input.browser || input.options?.browser || 'chromium',
    tags: [...new Set([...(input.tags || []), ...(input.mcpConfig?.tags || [])].map(String))],
    steps: Array.isArray(input.steps) ? input.steps : [],
    assertions: Array.isArray(input.assertions) ? input.assertions : [],
    timeoutMs: Number(input.timeoutMs || input.mcpConfig?.timeout || 30000),
    retries: Number(input.retries ?? input.mcpConfig?.retries ?? 0),
    apiPlan: input.apiPlan || input.apiTestPlan || null,
    code: String(input.code || '')
  };
  const errors = [];
  if (!SUPPORTED_SPECIFICATION_VERSIONS.has(spec.schemaVersion)) errors.push('schema_version_unsupported');
  if (!spec.name) errors.push('name_required');
  if (!spec.purpose) errors.push('purpose_required');
  if (!TEST_TYPES.has(spec.type)) errors.push('type_invalid');
  if (!BROWSERS.has(spec.browser)) errors.push('browser_invalid');
  if (spec.timeoutMs < 1000 || spec.timeoutMs > 900000) errors.push('timeout_out_of_range');
  if (spec.retries < 0 || spec.retries > 5) errors.push('retries_out_of_range');
  let validatedApiPlan = null;
  if (spec.type === 'api' && spec.apiPlan) {
    const apiPlanValidation = validateApiTestPlan(spec.apiPlan);
    if (!apiPlanValidation.valid) errors.push(...apiPlanValidation.errors.map(error => `api_plan:${error}`));
    else validatedApiPlan = apiPlanValidation.plan;
  }
  spec.apiPlan = validatedApiPlan;
  const hasExecutableApiPlan = spec.type === 'api' && Boolean(validatedApiPlan);
  if (!spec.steps.length && !spec.code && !hasExecutableApiPlan) errors.push('steps_or_code_required');
  if (!spec.assertions.length && !spec.code && !hasExecutableApiPlan) errors.push('assertions_required');
  if (spec.target.url && !/^https?:\/\//i.test(spec.target.url)) errors.push('target_url_invalid');
  return { valid: errors.length === 0, errors, spec };
}

function normalizeGeneratedTest(testData) {
  const result = validateTestSpecification({ ...testData, name: testData.name || `generated-${testData.id}`, purpose: testData.prompt, type: testData.testType });
  if (!result.valid) throw new Error(`test_specification_invalid:${result.errors.join(',')}`);
  return result.spec;
}

module.exports = { validateTestSpecification, normalizeGeneratedTest, TEST_TYPES, BROWSERS, SPECIFICATION_VERSION, SUPPORTED_SPECIFICATION_VERSIONS };
