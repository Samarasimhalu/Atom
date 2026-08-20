const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const MCPExecutor = require('./mcpExecutor');

class AppiumExecutor extends MCPExecutor {
  constructor(config) {
    super(config);
    this.maxConcurrent = Math.max(1, Number(config.execution.appium?.maxConcurrentTests || 1));
  }

  getMobileConfig(testData) {
    const mobile = testData?.mcpConfig?.mobile || testData?.options?.mobile || {};
    const platform = mobile.platform;
    if (!['ios', 'android'].includes(platform)) throw new Error('mobile_platform_not_configured');
    const appium = this.config.execution.appium || {};
    const deviceBrokerUrl = platform === 'ios' ? appium.iosDeviceBrokerUrl : appium.androidDeviceBrokerUrl;
    if (!this.config.execution.enabled || !appium.enabled) throw new Error('mobile_execution_disabled');
    if (appium.workerMode !== 'isolated-appium-image' || !appium.workerImage) throw new Error('appium_worker_not_configured');
    if (!/@sha256:[a-f0-9]{64}$/.test(appium.workerImage)) throw new Error('immutable_appium_worker_digest_required');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(String(appium.networkName || '')) || !deviceBrokerUrl) throw new Error('managed_mobile_device_broker_not_configured');
    let endpoint;
    try { endpoint = new URL(deviceBrokerUrl); } catch { throw new Error('managed_mobile_device_broker_not_configured'); }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('invalid_mobile_device_broker_url');
    return { platform, deviceName: mobile.deviceName || '', deviceBrokerUrl: endpoint.toString(), appium };
  }

  async executeTest(testData, sessionId, streamingService) {
    this.getMobileConfig(testData);
    if (this.activeExecutions.size >= this.maxConcurrent) {
      this.executionQueue.push({ testData, sessionId, streamingService });
      streamingService.broadcast({
        type: 'execution-queued',
        sessionId,
        position: this.executionQueue.length,
        message: 'Mobile test queued for Appium execution',
        timestamp: new Date().toISOString()
      });
      return { status: 'queued', sessionId };
    }
    return this.executeTestNow(testData, sessionId, streamingService);
  }

  async createExecutionEnvironment(testData, sessionId) {
    const executionDir = path.join(this.config.storage.tests, `execution-${sessionId}`);
    await fs.ensureDir(executionDir);
    const mobile = this.getMobileConfig(testData);
    await fs.writeFile(path.join(executionDir, 'mobile.spec.ts'), testData.code, { mode: 0o644 });
    await fs.writeJson(path.join(executionDir, 'mobile-run.json'), {
      platform: mobile.platform,
      deviceName: mobile.deviceName,
      automationName: mobile.platform === 'ios' ? 'XCUITest' : 'UiAutomator2',
      timeoutMs: Math.max(1000, Math.min(Number(testData?.mcpConfig?.timeout || this.config.execution.hardTimeoutMs), this.config.execution.hardTimeoutMs))
    }, { spaces: 2 });
    await fs.ensureDir(path.join(executionDir, 'results'));
    return executionDir;
  }

  buildDockerArgs(executionDir, runResultsDir, mobile) {
    return [
      'run', '--rm',
      '--network', mobile.appium.networkName,
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges:true',
      '--pids-limit=128',
      '--memory=2g',
      '--cpus=2',
      '--tmpfs=/tmp:rw,noexec,nosuid,size=256m',
      '--tmpfs=/home/atom-worker:rw,noexec,nosuid,size=64m',
      '-e', `ATOM_DEVICE_BROKER_URL=${mobile.deviceBrokerUrl}`,
      '-v', `${path.resolve(executionDir)}:/work:ro`,
      '-v', `${runResultsDir}:/results:rw`,
      '-w', '/work',
      mobile.appium.workerImage
    ];
  }

  async runTest(testData, sessionId, executionDir, streamingService) {
    const resultRoot = path.resolve(this.config.storage.results);
    const runResultsDir = path.resolve(resultRoot, sessionId);
    if (!runResultsDir.startsWith(`${resultRoot}${path.sep}`)) throw new Error('invalid_session_results_path');
    await fs.ensureDir(runResultsDir);
    const mobile = this.getMobileConfig(testData);
    return new Promise((resolve, reject) => {
      const child = spawn('docker', this.buildDockerArgs(executionDir, runResultsDir, mobile), {
        cwd: executionDir,
        stdio: 'pipe',
        env: { PATH: process.env.PATH, CI: 'true' }
      });
      this.processes.set(sessionId, child);
      let output = '';
      let errorOutput = '';
      const startTime = new Date();
      child.stdout.on('data', data => {
        const chunk = data.toString(); output += chunk;
        streamingService.broadcast({ type: 'test-output', sessionId, data: chunk, timestamp: new Date().toISOString() });
      });
      child.stderr.on('data', data => {
        const chunk = data.toString(); errorOutput += chunk;
        streamingService.broadcast({ type: 'test-error', sessionId, data: chunk, timestamp: new Date().toISOString() });
      });
      const timeout = setTimeout(() => child.kill('SIGKILL'), this.config.execution.hardTimeoutMs);
      child.on('close', code => {
        clearTimeout(timeout); this.processes.delete(sessionId);
        const endTime = new Date();
        const result = {
          exitCode: code, output, errorOutput, duration: endTime - startTime,
          startTime: startTime.toISOString(), endTime: endTime.toISOString(),
          status: code === 0 ? 'passed' : 'failed', sessionId, testData,
          executionRuntime: 'appium'
        };
        streamingService.broadcast({ type: 'test-completed', sessionId, result: { status: result.status, duration: result.duration, exitCode: result.exitCode }, timestamp: new Date().toISOString() });
        resolve(result);
      });
      child.on('error', error => {
        streamingService.broadcast({ type: 'test-execution-error', sessionId, error: error.message, timestamp: new Date().toISOString() });
        reject(error);
      });
    });
  }
}

module.exports = AppiumExecutor;
