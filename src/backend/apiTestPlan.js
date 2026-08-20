const crypto = require('crypto');

const API_TEST_PLAN_VERSION = 'api-test-plan/v1';
const MAX_STEPS = 50;
const MAX_ASSERTIONS_PER_STEP = 30;
const MAX_EXTRACTIONS_PER_STEP = 20;
const MAX_VARIABLES = 100;
const METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']);
const VARIABLE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const STEP_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const JSON_PATH = /^\$(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])*$/;
const PLACEHOLDER = /\{\{chain\.([A-Za-z][A-Za-z0-9_]*)\}\}/g;
const BLOCKED_PROPERTY = new Set(['__proto__', 'prototype', 'constructor']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function isJsonValue(value, depth = 0) {
  if (depth > 20 || value === null) return depth <= 20;
  if (['string', 'number', 'boolean'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(entry => isJsonValue(entry, depth + 1));
  if (isPlainObject(value)) return Object.entries(value).every(([key, entry]) => !BLOCKED_PROPERTY.has(key) && isJsonValue(entry, depth + 1));
  return false;
}

function normalizeHeaders(headers) {
  if (!headers) return {};
  if (!isPlainObject(headers)) throw new Error('api_headers_invalid');
  const normalized = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name) || typeof value !== 'string' || value.length > 4096) {
      throw new Error('api_header_invalid');
    }
    normalized[name.toLowerCase()] = value;
  }
  return normalized;
}

function parseJsonPath(path) {
  if (typeof path !== 'string' || !JSON_PATH.test(path)) throw new Error('api_json_path_invalid');
  const tokens = [];
  const matcher = /\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]/g;
  let match;
  while ((match = matcher.exec(path))) {
    const token = match[1] ?? Number(match[2]);
    if (typeof token === 'string' && BLOCKED_PROPERTY.has(token)) throw new Error('api_json_path_forbidden_property');
    tokens.push(token);
  }
  return tokens;
}

function readJsonPath(value, path) {
  let current = value;
  for (const token of parseJsonPath(path)) {
    if (current === null || current === undefined || !Object.prototype.hasOwnProperty.call(Object(current), token)) return undefined;
    current = current[token];
  }
  return current;
}

function containsPlaceholder(value) {
  if (typeof value === 'string') return PLACEHOLDER.test(value.replace(PLACEHOLDER, match => match));
  if (Array.isArray(value)) return value.some(containsPlaceholder);
  if (isPlainObject(value)) return Object.values(value).some(containsPlaceholder);
  return false;
}

function referencedVariables(value, result = new Set()) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/\{\{chain\.([A-Za-z][A-Za-z0-9_]*)\}\}/g)) result.add(match[1]);
  } else if (Array.isArray(value)) {
    value.forEach(entry => referencedVariables(entry, result));
  } else if (isPlainObject(value)) {
    Object.values(value).forEach(entry => referencedVariables(entry, result));
  }
  return result;
}

function resolvePlaceholders(value, variables) {
  if (typeof value === 'string') {
    const full = value.match(/^\{\{chain\.([A-Za-z][A-Za-z0-9_]*)\}\}$/);
    if (full) {
      if (!Object.prototype.hasOwnProperty.call(variables, full[1])) throw new Error(`api_chain_reference_missing:${full[1]}`);
      return variables[full[1]];
    }
    return value.replace(/\{\{chain\.([A-Za-z][A-Za-z0-9_]*)\}\}/g, (_match, name) => {
      if (!Object.prototype.hasOwnProperty.call(variables, name)) throw new Error(`api_chain_reference_missing:${name}`);
      const resolved = variables[name];
      if (resolved !== null && typeof resolved === 'object') throw new Error(`api_chain_reference_non_scalar:${name}`);
      return String(resolved);
    });
  }
  if (Array.isArray(value)) return value.map(entry => resolvePlaceholders(entry, variables));
  if (isPlainObject(value)) {
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      if (BLOCKED_PROPERTY.has(key)) throw new Error('api_plan_forbidden_property');
      output[key] = resolvePlaceholders(entry, variables);
    }
    return output;
  }
  return value;
}

function normalizeAssertion(assertion) {
  if (!isPlainObject(assertion)) throw new Error('api_assertion_invalid');
  const type = String(assertion.type || '').trim();
  if (type === 'status') {
    const expected = Array.isArray(assertion.equals) ? assertion.equals : [assertion.equals];
    if (!expected.length || expected.some(value => !Number.isInteger(value) || value < 100 || value > 599)) throw new Error('api_status_assertion_invalid');
    return { type, equals: expected };
  }
  if (type === 'json_path_exists') return { type, path: String(assertion.path || '') , required: assertion.required !== false };
  if (type === 'json_path_equals') {
    if (!isJsonValue(assertion.equals)) throw new Error('api_json_assertion_value_invalid');
    return { type, path: String(assertion.path || ''), equals: assertion.equals };
  }
  if (type === 'header_equals') {
    if (typeof assertion.name !== 'string' || typeof assertion.equals !== 'string') throw new Error('api_header_assertion_invalid');
    return { type, name: assertion.name.toLowerCase(), equals: assertion.equals };
  }
  throw new Error('api_assertion_type_invalid');
}

function validateApiTestPlan(input) {
  const errors = [];
  if (!isPlainObject(input)) return { valid: false, errors: ['api_plan_invalid'], plan: null };
  const plan = {
    kind: String(input.kind || API_TEST_PLAN_VERSION),
    name: String(input.name || '').trim(),
    contractVersion: String(input.contractVersion || '').trim(),
    environment: String(input.environment || '').trim(),
    steps: []
  };
  if (plan.kind !== API_TEST_PLAN_VERSION) errors.push('api_plan_version_unsupported');
  if (!plan.name) errors.push('api_plan_name_required');
  if (!plan.environment) errors.push('api_plan_environment_required');
  if (!Array.isArray(input.steps) || input.steps.length === 0 || input.steps.length > MAX_STEPS) errors.push('api_plan_steps_invalid');
  const ids = new Set();
  const producedVariables = new Set();
  const allVariables = new Set();
  for (const [index, rawStep] of (Array.isArray(input.steps) ? input.steps : []).entries()) {
    try {
      if (!isPlainObject(rawStep)) throw new Error('api_step_invalid');
      const id = String(rawStep.id || '').trim();
      const method = String(rawStep.request?.method || rawStep.method || '').toUpperCase();
      const path = String(rawStep.request?.path || rawStep.path || '').trim();
      if (!STEP_ID.test(id) || ids.has(id)) throw new Error('api_step_id_invalid');
      ids.add(id);
      if (!METHODS.has(method)) throw new Error('api_method_invalid');
      if (!path.startsWith('/') || path.includes('://') || path.includes('\\') || path.length > 2048) throw new Error('api_path_invalid');
      const headers = normalizeHeaders(rawStep.request?.headers || rawStep.headers);
      const body = rawStep.request?.body ?? rawStep.body;
      if (body !== undefined && !isJsonValue(body)) throw new Error('api_body_invalid');
      const assertions = (rawStep.assertions || []).map(normalizeAssertion);
      if (!assertions.length || assertions.length > MAX_ASSERTIONS_PER_STEP) throw new Error('api_assertions_invalid');
      for (const assertion of assertions) {
        if (assertion.path) parseJsonPath(assertion.path);
      }
      const extract = rawStep.extract || [];
      if (!Array.isArray(extract) || extract.length > MAX_EXTRACTIONS_PER_STEP) throw new Error('api_extractions_invalid');
      const normalizedExtract = extract.map(rule => {
        if (!isPlainObject(rule) || !VARIABLE_NAME.test(String(rule.name || '')) || rule.source && rule.source !== 'body') throw new Error('api_extraction_invalid');
        const name = String(rule.name);
        if (producedVariables.has(name)) throw new Error('api_extraction_duplicate');
        parseJsonPath(String(rule.path || ''));
        return { name, source: 'body', path: String(rule.path), required: rule.required !== false, classification: rule.classification === 'secret' ? 'secret' : 'internal' };
      });
      const request = { method, path, headers, ...(body !== undefined ? { body } : {}) };
      for (const variable of referencedVariables(request)) {
        if (!producedVariables.has(variable)) throw new Error(`api_chain_forward_reference:${variable}`);
      }
      for (const rule of normalizedExtract) { producedVariables.add(rule.name); allVariables.add(rule.name); }
      plan.steps.push({ id, request, assertions, extract: normalizedExtract });
    } catch (error) {
      errors.push(`step_${index}:${error.message}`);
    }
  }
  if (allVariables.size > MAX_VARIABLES) errors.push('api_plan_variables_exceeded');
  return { valid: errors.length === 0, errors, plan };
}

function evaluateAssertions(assertions, response) {
  const failures = [];
  const headers = Object.fromEntries(Object.entries(response.headers || {}).map(([key, value]) => [key.toLowerCase(), String(value)]));
  for (const assertion of assertions) {
    if (assertion.type === 'status' && !assertion.equals.includes(response.status)) failures.push({ type: assertion.type, expected: assertion.equals, actual: response.status });
    if (assertion.type === 'json_path_exists' && (readJsonPath(response.body, assertion.path) === undefined) === assertion.required) failures.push({ type: assertion.type, path: assertion.path });
    if (assertion.type === 'json_path_equals') {
      const actual = readJsonPath(response.body, assertion.path);
      if (JSON.stringify(actual) !== JSON.stringify(assertion.equals)) failures.push({ type: assertion.type, path: assertion.path });
    }
    if (assertion.type === 'header_equals' && headers[assertion.name] !== assertion.equals) failures.push({ type: assertion.type, name: assertion.name });
  }
  return failures;
}

async function runApiTestPlan(input, { request, onStep } = {}) {
  if (typeof request !== 'function') throw new Error('api_request_adapter_required');
  const validated = validateApiTestPlan(input);
  if (!validated.valid) throw new Error(`api_plan_invalid:${validated.errors.join(',')}`);
  const variables = Object.create(null);
  const results = [];
  const startedAt = Date.now();
  for (const step of validated.plan.steps) {
    const requestPayload = resolvePlaceholders(step.request, variables);
    const started = Date.now();
    const response = await request(requestPayload, { stepId: step.id, environment: validated.plan.environment });
    if (!isPlainObject(response) || !Number.isInteger(response.status) || !isPlainObject(response.headers || {}) || !Object.prototype.hasOwnProperty.call(response, 'body')) {
      throw new Error('api_response_adapter_invalid');
    }
    const failures = evaluateAssertions(step.assertions, response);
    const extracted = [];
    if (!failures.length) {
      for (const rule of step.extract) {
        const value = readJsonPath(response.body, rule.path);
        if (value === undefined && rule.required) throw new Error(`api_extraction_missing:${rule.name}`);
        if (value !== undefined) {
          if (!isJsonValue(value)) throw new Error(`api_extraction_value_invalid:${rule.name}`);
          variables[rule.name] = value;
        }
        extracted.push({ name: rule.name, present: value !== undefined, classification: rule.classification });
      }
    }
    const stepResult = { id: step.id, status: failures.length ? 'failed' : 'passed', durationMs: Date.now() - started, assertionFailures: failures, extracted };
    results.push(stepResult);
    if (typeof onStep === 'function') onStep(stepResult);
    if (failures.length) break;
  }
  return {
    status: results.length === validated.plan.steps.length && results.every(result => result.status === 'passed') ? 'passed' : 'failed',
    durationMs: Date.now() - startedAt,
    steps: results,
    planDigest: crypto.createHash('sha256').update(JSON.stringify(validated.plan)).digest('hex')
  };
}

module.exports = {
  API_TEST_PLAN_VERSION,
  MAX_STEPS,
  validateApiTestPlan,
  resolvePlaceholders,
  readJsonPath,
  runApiTestPlan
};
