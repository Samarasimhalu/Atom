const fs = require('fs');
const { spawn } = require('child_process');

const CONFIG_PATH = '/work/mobile-run.json';
const BROKER_URL = process.env.ATOM_DEVICE_BROKER_URL || '';
const ALLOWED_PLATFORMS = new Set(['ios', 'android']);

function fail(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

function readConfig() {
  let config;
  try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { fail('mobile_worker_config_invalid'); }
  if (!ALLOWED_PLATFORMS.has(config.platform)) fail('mobile_worker_platform_invalid');
  if (config.automationName !== (config.platform === 'ios' ? 'XCUITest' : 'UiAutomator2')) fail('mobile_worker_driver_invalid');
  return config;
}

function readBrokerUrl() {
  let endpoint;
  try { endpoint = new URL(BROKER_URL); }
  catch { fail('mobile_worker_device_broker_invalid'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) fail('mobile_worker_device_broker_invalid');
  return endpoint;
}

function createWdioConfig(mobile, endpoint) {
  const path = endpoint.pathname === '/' ? '/wd/hub' : endpoint.pathname.replace(/\/$/, '');
  return `exports.config = {
  runner: 'local',
  specs: ['/work/mobile.spec.ts'],
  maxInstances: 1,
  hostname: ${JSON.stringify(endpoint.hostname)},
  port: ${JSON.stringify(endpoint.port ? Number(endpoint.port) : 443)},
  protocol: 'https',
  path: ${JSON.stringify(path)},
  logLevel: 'warn',
  framework: 'mocha',
  reporters: [['junit', { outputDir: '/results', outputFileFormat: () => 'results.xml' }], 'spec'],
  mochaOpts: { ui: 'bdd', timeout: ${Math.max(1000, Math.min(Number(mobile.timeoutMs) || 120000, 300000))} },
  autoCompileOpts: { autoCompile: true, tsNodeOpts: { transpileOnly: true, project: '/opt/atom-appium-worker/tsconfig.json' } },
  capabilities: [{
    platformName: ${JSON.stringify(mobile.platform === 'ios' ? 'iOS' : 'Android')},
    'appium:automationName': ${JSON.stringify(mobile.automationName)},
    ...( ${JSON.stringify(mobile.deviceName || '')} ? { 'appium:deviceName': ${JSON.stringify(mobile.deviceName || '')} } : {} ),
    'appium:newCommandTimeout': 120
  }]
};\n`;
}

const mobile = readConfig();
const broker = readBrokerUrl();
fs.writeFileSync('/tmp/wdio.conf.cjs', createWdioConfig(mobile, broker), { mode: 0o600 });
const child = spawn('/opt/atom-appium-worker/node_modules/.bin/wdio', ['/tmp/wdio.conf.cjs'], {
  cwd: '/work',
  stdio: 'inherit',
  env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', NODE_ENV: 'production' }
});
child.on('error', error => fail(`mobile_worker_runner_failed:${error.message}`));
child.on('close', code => process.exit(code ?? 1));
