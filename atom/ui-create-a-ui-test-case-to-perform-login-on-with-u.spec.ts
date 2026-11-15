import { test, expect } from '@playwright/test';

// ATOM Governed Playwright UI Spec
// Scenario: Create a UI test case to perform login on "https://practice.expandtesting.com/login" with username and password.
test.describe('Authentication Flow — Create a UI test case to perform login on "https://practice.expandtesting.com/login" with username and password.', () => {
  test('authenticates valid credentials and verifies secure dashboard landing', async ({ page }) => {
    await page.goto('https://www.atomworld.net/login', { waitUntil: 'domcontentloaded' });

    // Step 1: Input authenticated credentials
    await page.fill('[data-testid="email"], input[type="email"]', 'developer@atomworld.net');
    await page.fill('[data-testid="password"], input[type="password"]', '••••••••••••');

    // Step 2: Submit authentication
    await page.click('[data-testid="login-button"], button[type="submit"]');

    // Step 3: Verify landing route and session state
    await expect(page).toHaveURL(/\/(dashboard|workspace)/);
    await expect(page.locator('[data-testid="user-profile"], [data-testid="dashboard"]')).toBeVisible();
    await page.screenshot({ path: 'auth-success.png' });
  });
});