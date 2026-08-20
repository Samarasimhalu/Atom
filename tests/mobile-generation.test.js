const test = require('node:test');
const assert = require('node:assert/strict');
const AITestGenerator = require('../src/backend/aiTestGenerator');
const AppiumExecutor = require('../src/backend/appiumExecutor');
const { validateGenerationRequest } = require('../src/backend/validation');
const { denyUnsafeExecution } = require('../src/backend/security');

const digest = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const managedScript = "import { browser } from '@wdio/globals';\ndescribe('mobile', () => { it('uses the managed session', async () => browser.$('~primary-action')); });";
const generatorConfig = {
  ai: { allowedModels: [] },
  mcp: { testTimeout: 30000, videoRecording: false, traceOnFailure: false, maxConcurrentTests: 1 },
  execution: { retries: 0, headless: true, viewport: { width: 1280, height: 720 }, workers: 1 }
};

function mobileTest(platform, deviceName) {
  return { testType: 'mobile', code: managedScript, mcpConfig: { timeout: 30000, mobile: { platform, ...(deviceName ? { deviceName } : {}) } } };
}

function appiumConfig(overrides = {}) {
  return {
    storage: { tests: '/tmp/atom-tests', results: '/tmp/atom-results' },
    mcp: { maxConcurrentTests: 1 },
    execution: {
      enabled: true,
      hardTimeoutMs: 300000,
      appium: {
        enabled: true,
        workerMode: 'isolated-appium-image',
        workerImage: `registry.example/atom-appium-worker@${digest}`,
        networkName: 'atom-appium-private',
        androidDeviceBrokerUrl: 'https://android-broker.example/automation',
        iosDeviceBrokerUrl: 'https://ios-broker.example/automation',
        maxConcurrentTests: 1
      },
      ...overrides
    }
  };
}

function invokeGuard(body, appium = {}, playwrightWorkerImage = `registry.example/atom-worker@${digest}`) {
  let response;
  const config = {
    execution: {
      enabled: true,
      workerImage: playwrightWorkerImage,
      networkMode: 'none',
      appium: {
        enabled: true,
        workerMode: 'isolated-appium-image',
        workerImage: `registry.example/atom-appium-worker@${digest}`,
        networkName: 'atom-appium-private',
        androidDeviceBrokerUrl: 'https://android-broker.example/automation',
        iosDeviceBrokerUrl: 'https://ios-broker.example/automation',
        maxConcurrentTests: 1,
        ...appium
      }
    },
    policy: { allowedDomains: [] }
  };
  const middleware = denyUnsafeExecution(config);
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

test('generates iOS XCUITest WebdriverIO script using the managed session without credentials', () => {
  const generator = new AITestGenerator(generatorConfig);
  const script = generator.fallbackGenerator.generateTest('complete checkout', 'mobile', { mobile: { platform: 'ios' } });
  assert.match(script, /from '@wdio\/globals'/);
  assert.match(script, /browser\.\$\('~primary-action'\)/);
  assert.match(script, /XCUITest/);
  assert.match(script, /iPhone Simulator/);
  assert.match(script, /iOS/);
  assert.match(script, /~success-state/);
  assert.doesNotMatch(script, /\bremote\s*\(/);
  assert.doesNotMatch(script, /process\.env|ATOM_APPIUM_HOST|ATOM_APPIUM_PORT|api[_-]?key\s*[:=]/i);
});

test('generates Android UiAutomator2 WebdriverIO script and propagates a requested device name', () => {
  const generator = new AITestGenerator(generatorConfig);
  const script = generator.fallbackGenerator.generateTest('complete checkout', 'mobile', { mobile: { platform: 'android', deviceName: 'Pixel 8' } });
  assert.match(script, /from '@wdio\/globals'/);
  assert.match(script, /UiAutomator2/);
  assert.match(script, /Android Emulator/);
  assert.match(script, /Android/);
  assert.match(script, /Pixel 8/);
  assert.match(script, /browser\.saveScreenshot\('\/results\/android-workflow\.png'\)/);
  assert.doesNotMatch(script, /\bremote\s*\(|process\.env|ATOM_APPIUM_HOST|ATOM_APPIUM_PORT/i);
});

test('includes platform-specific managed-session instructions in the AI system prompt', () => {
  const generator = new AITestGenerator(generatorConfig);
  const prompt = generator.getSystemPrompt('mobile');
  assert.match(prompt, /@wdio\/globals/);
  assert.match(prompt, /XCUITest/);
  assert.match(prompt, /UiAutomator2/);
  assert.match(prompt, /create sessions with remote\(\)/);
  assert.match(prompt, /Never read environment variables/);
  assert.match(prompt, /managed device broker/);
});

test('fails closed for mobile execution when the Appium worker is not fully configured', () => {
  const response = invokeGuard({ testData: mobileTest('ios') }, { enabled: false });
  assert.equal(response.code, 403);
  assert.equal(response.payload.reason, 'mobile_execution_disabled');
});

test('allows a managed mobile script only with an immutable configured Appium worker and matching device broker', () => {
  const response = invokeGuard({ testData: mobileTest('android', 'Pixel 8') });
  assert.deepEqual(response, { next: true });
});

test('allows a configured mobile-only deployment without a Playwright worker image', () => {
  const response = invokeGuard({ testData: mobileTest('ios') }, {}, '');
  assert.deepEqual(response, { next: true });
});

test('rejects mobile scripts that attempt to establish their own Appium session', () => {
  const response = invokeGuard({ testData: { ...mobileTest('ios'), code: "import { remote } from 'webdriverio';\nremote({ hostname: 'untrusted.example' });" } });
  assert.equal(response.code, 403);
  assert.equal(response.payload.reason, 'mobile_script_must_use_managed_session');
});

test('Appium executor rejects incomplete, non-HTTPS, and credential-bearing managed device broker URLs', () => {
  assert.throws(() => new AppiumExecutor(appiumConfig({ appium: { enabled: false } })).getMobileConfig(mobileTest('ios')), /mobile_execution_disabled/);
  const nonHttps = appiumConfig();
  nonHttps.execution.appium.androidDeviceBrokerUrl = 'http://android-broker.example/automation';
  assert.throws(() => new AppiumExecutor(nonHttps).getMobileConfig(mobileTest('android')), /invalid_mobile_device_broker_url/);
  const credentialed = appiumConfig();
  credentialed.execution.appium.iosDeviceBrokerUrl = 'https://tenant:secret@ios-broker.example/automation';
  assert.throws(() => new AppiumExecutor(credentialed).getMobileConfig(mobileTest('ios')), /invalid_mobile_device_broker_url/);
});

test('Appium executor accepts fully configured iOS and Android requests and builds a hardened worker command', () => {
  const executor = new AppiumExecutor(appiumConfig());
  const ios = executor.getMobileConfig(mobileTest('ios', 'iPhone 16'));
  const android = executor.getMobileConfig(mobileTest('android', 'Pixel 8'));
  assert.equal(ios.deviceName, 'iPhone 16');
  assert.equal(android.deviceName, 'Pixel 8');
  assert.equal(ios.deviceBrokerUrl, 'https://ios-broker.example/automation');
  const args = executor.buildDockerArgs('/tmp/atom-test-run', '/tmp/atom-results/run-1', android);
  assert.ok(args.includes('--network'));
  assert.ok(args.includes('atom-appium-private'));
  assert.ok(args.includes('--read-only'));
  assert.ok(args.includes('--cap-drop=ALL'));
  assert.ok(args.includes('--security-opt=no-new-privileges:true'));
  assert.ok(args.includes('/tmp/atom-test-run:/work:ro'));
  assert.ok(!args.some(argument => argument.includes('--privileged') || argument.includes('--device')));
});
