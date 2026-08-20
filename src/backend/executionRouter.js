class ExecutionRouter {
  constructor({ playwrightExecutor, appiumExecutor }) {
    this.playwrightExecutor = playwrightExecutor;
    this.appiumExecutor = appiumExecutor;
  }

  isMobile(testData) {
    return (testData?.testType || testData?.mcpConfig?.type) === 'mobile';
  }

  executeTest(testData, sessionId, streamingService) {
    return (this.isMobile(testData) ? this.appiumExecutor : this.playwrightExecutor).executeTest(testData, sessionId, streamingService);
  }

  cancelExecution(sessionId) {
    const cancelledMobile = this.appiumExecutor.cancelExecution(sessionId);
    const cancelledWeb = this.playwrightExecutor.cancelExecution(sessionId);
    return cancelledMobile || cancelledWeb;
  }
}

module.exports = ExecutionRouter;
