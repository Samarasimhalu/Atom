# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-create-a-ui-test-case-to-perform-login-on-with-u.spec.ts >> Authentication Flow — Create a UI test case to perform login on "https://practice.expandtesting.com/login" with username and password. >> authenticates valid credentials and verifies secure dashboard landing
- Location: atom\ui-create-a-ui-test-case-to-perform-login-on-with-u.spec.ts:6:7

# Error details

```
Test timeout of 300000ms exceeded.
```

```
Error: page.fill: Test timeout of 300000ms exceeded.
Call log:
  - waiting for locator('[data-testid="email"], input[type="email"]')

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - paragraph [ref=e3]
  - paragraph [ref=e5]:
    - strong [ref=e6]: We're having a really bad day.
  - paragraph [ref=e7]: The Unicorns have taken over. We're doing our best to get them under control and get GitHub back up and running.
  - generic [ref=e8]:
    - link "Contact Support" [ref=e9] [cursor=pointer]:
      - /url: https://github.com/contact
    - text: —
    - link "GitHub Status" [ref=e10] [cursor=pointer]:
      - /url: https://status.github.com
    - text: —
    - link "@githubstatus" [ref=e11] [cursor=pointer]:
      - /url: https://twitter.com/githubstatus
  - link [ref=e12] [cursor=pointer]:
    - /url: /
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | // ATOM Governed Playwright UI Spec
  4  | // Scenario: Create a UI test case to perform login on "https://practice.expandtesting.com/login" with username and password.
  5  | test.describe('Authentication Flow — Create a UI test case to perform login on "https://practice.expandtesting.com/login" with username and password.', () => {
  6  |   test('authenticates valid credentials and verifies secure dashboard landing', async ({ page }) => {
  7  |     await page.goto('https://www.atomworld.net/login', { waitUntil: 'domcontentloaded' });
  8  | 
  9  |     // Step 1: Input authenticated credentials
> 10 |     await page.fill('[data-testid="email"], input[type="email"]', 'developer@atomworld.net');
     |                ^ Error: page.fill: Test timeout of 300000ms exceeded.
  11 |     await page.fill('[data-testid="password"], input[type="password"]', '••••••••••••');
  12 | 
  13 |     // Step 2: Submit authentication
  14 |     await page.click('[data-testid="login-button"], button[type="submit"]');
  15 | 
  16 |     // Step 3: Verify landing route and session state
  17 |     await expect(page).toHaveURL(/\/(dashboard|workspace)/);
  18 |     await expect(page.locator('[data-testid="user-profile"], [data-testid="dashboard"]')).toBeVisible();
  19 |     await page.screenshot({ path: 'auth-success.png' });
  20 |   });
  21 | });
```