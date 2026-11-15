import { test, expect } from '@playwright/test';

// Define the test suite for login functionality
test('Perform Login Operation on Practice Expand Testing Login Page', async ({ page }) => {
  // Navigate to the login page
  await page.goto('https://practice.expandtesting.com/login');

  // Assert the page title
  await expect(page).toHaveTitle(/Test Login Page/);

  // Assert the presence of page headings
  const headings = [
    { tag: 'h1', text: 'Test Login page for Automation Testing Practice' },
    { tag: 'h2', text: 'How to test the login page?' },
    { tag: 'h3', text: 'How Does Form-Based Authentication Work?' },
    { tag: 'h2', text: 'Login Automation Test Cases' },
    { tag: 'h2', text: 'Login Automation Test Cases' },
    { tag: 'h3', text: 'Test Case 1: Successful Login' }
  ];

  // for (const heading of headings) {
  //   await expect(page.locator(heading.tag, { hasText: heading.text })).toBeVisible();
  // }

  // Assert the presence of inputs
  const inputs = [
    { selector: '#username', type: 'text', id: 'username', name: 'username', label: 'Username' },
    { selector: '#password', type: 'password', id: 'password', name: 'password', label: 'Password' }
  ];

  for (const input of inputs) {
    await expect(page.locator(input.selector)).toBeVisible();
  }

  // Assert the presence of button
  await expect(page.locator('#submit-login', { hasText: 'Login' })).toBeVisible();

  // Perform login operation with valid credentials
  await page.fill('#username', 'practice');
  await page.fill('#password', 'password');
  await page.click('#submit-login');
});
// Test for async operations (e.g., waiting for page to load)
test.afterEach(async ({ page }) => {
  await page.waitForTimeout(1000); // Simulate a delay for async operations
});
