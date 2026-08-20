const test = require('node:test');
const assert = require('node:assert/strict');
const AITestGenerator = require('../src/backend/aiTestGenerator');
const { validateGenerationRequest } = require('../src/backend/validation');
const { denyUnsafeExecution } = require('../src/backend/security');

const generatorConfig = {
  ai: { allowedModels: [] },
  mcp: { testTimeout: 30000, videoRecording: false, traceOnFailure: false },
  execution: { retries: 0, headless: true, viewport: { width: 1280, height: 720 }, workers: 1 }
};

function invokeGuard(body) {
  let response;
  const middleware = denyUnsafeExecution({
    execution: { enabled: true, workerImage: 'registry.example/atom-worker@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', networkMode: 'none' },
    policy: { allowedDomains: [] }
  });
  middleware({ body, correlationId: 'corr-mobile' }, {
    status: code => {
      response = { code };
      return { json: payload => { response.payload = payload; } };
    }
  }, () => { response = { next: true }; });
  return response;
}

test('accepts explicit Android and iOS mobile generation targets while rejecting ambiguous mobile requests', () => {
  const android = validateGenerationRequest({ prompt: 'Validate checkout in Android', testType: 'mobile', options: { mobile: { platform: 'android', deviceName: 'Pixel 8' } } });
  const ios = validateGenerationRequest({ prompt: 'Validate checkout in iOS', testType: 'mobile', options: { mobile: { platform: 'ios' } } });
  assert.equal(android.options.mobile.platform, 'android');
  assert.equal(android.options.mobile.deviceName, 'Pixel 8');
  assert.equal(ios.options.mobile.platform, 'ios');
  assert.throws(() => validateGenerationRequest({ prompt: 'Validate checkout', testType: 'mobile', options: {} }), /Mobile generation requires/);
  assert.throws(() => validateGenerationRequest({ prompt: 'Validate checkout', testType: 'mobile', options: { mobile: { platform: 'windows' } } }), /Mobile platform must be ios or android/);
});

test('generates platform-specific Appium fallback scripts without embedding credentials', () => {
  const generator = new AITestGenerator(generatorConfig);
  const android = generator.fallbackGenerator.generateTest('complete checkout', 'mobile', { mobile: { platform: 'android', deviceName: 'Pixel 8' } });
  const ios = generator.fallbackGenerator.generateTest('complete checkout', 'mobile', { mobile: { platform: 'ios' } });
  assert.match(android, /from 'webdriverio'/);
  assert.match(android, /UiAutomator2/);
  assert.match(android, /Pixel 8/);
  assert.match(ios, /XCUITest/);
  assert.match(ios, /iPhone Simulator/);
  assert.doesNotMatch(android, /api[_-]?key\s*[:=]\s*[^\s]/i);
});

test('fails closed when a mobile test is submitted to the Playwright-only worker path', () => {
  const response = invokeGuard({ testData: { testType: 'mobile', code: "import { remote } from 'webdriverio';" } });
  assert.equal(response.code, 403);
  assert.equal(response.payload.reason, 'mobile_execution_not_supported_by_worker');
});
