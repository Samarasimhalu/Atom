module.exports = {
  testDir: "c:\\Users\\jayas\\Atom\\atom",
  testMatch: new RegExp("(?:^|[\\\\/])ui-perform-login-operation-on-this-website-with-use\\.spec\\.ts$"),
  timeout: 300000,
  retries: 2,
  workers: 1,
  outputDir: "c:\\Users\\jayas\\Atom\\.atom\\runs\\atom-run-9f3d6c18\\artifacts",
  use: {
    browserName: "chromium",
    headless: true,
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    viewport: {"width":1920,"height":1080}
  },
  reporter: [
    ['json', { outputFile: "c:\\Users\\jayas\\Atom\\.atom\\runs\\atom-run-9f3d6c18\\results.json" }],
    ['line']
  ]
};
