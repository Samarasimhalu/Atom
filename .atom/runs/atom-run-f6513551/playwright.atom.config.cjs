module.exports = {
  testDir: "c:\\Users\\jayas\\Atom\\atom",
  testMatch: new RegExp("(?:^|[\\\\/])ui-create-a-ui-test-case-to-perform-login-on-with-u\\.spec\\.ts$"),
  timeout: 300000,
  retries: 2,
  workers: 1,
  outputDir: "c:\\Users\\jayas\\Atom\\.atom\\runs\\atom-run-f6513551\\artifacts",
  use: {
    browserName: "chromium",
    headless: true,
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    viewport: {"width":1920,"height":1080}
  },
  reporter: [
    ['json', { outputFile: "c:\\Users\\jayas\\Atom\\.atom\\runs\\atom-run-f6513551\\results.json" }],
    ['line']
  ]
};
