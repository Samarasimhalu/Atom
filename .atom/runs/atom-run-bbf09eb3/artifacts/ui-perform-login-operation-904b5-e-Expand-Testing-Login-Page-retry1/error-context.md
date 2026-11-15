# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-perform-login-operation-on-this-website-with-use.spec.ts >> Perform Login Operation on Practice Expand Testing Login Page
- Location: atom\ui-perform-login-operation-on-this-website-with-use.spec.ts:4:5

# Error details

```
Error: expect(page).toHaveTitle(expected) failed

Expected pattern: /Welcome to the Secure Area/
Received string:  "Test Login Page for Automation Testing Practice"
Timeout: 5000ms

Call log:
  - Expect "toHaveTitle" with timeout 5000ms
    14 × locator resolved to <html lang="en">…</html>
       - unexpected value "Test Login Page for Automation Testing Practice"

```

```yaml
- paragraph:
  - link "PMP Practice":
    - /url: https://pmp.expandtesting.com/
  - text: "| Free PMP Certification Mock Exam Test +900 Questions & Quizzes"
  - link "Software testing course":
    - img
    - text: Software testing course
- banner:
  - navigation "Main navigation":
    - link "SUT":
      - /url: /
      - 'img "Best Website for Practice Automation Testing: Free UI and REST API Examples and Apps. Using Cypress, Playwright, Selenium, WebdriverIO and Postman."'
      - text: Practice
    - list:
      - listitem:
        - button "Demos"
      - listitem:
        - link "Tools":
          - /url: /#tools
      - listitem:
        - link "Tips":
          - /url: /tips
      - listitem:
        - link "Test Cases":
          - /url: /test-cases
      - listitem:
        - link "API Testing":
          - /url: /notes/api/api-docs/
      - listitem:
        - link "About":
          - /url: /about
    - list
    - link "Free ISTQB Mock Exams":
      - /url: https://istqb.expandtesting.com/
- main:
  - insertion:
    - iframe
  - alert:
    - text: Your password is invalid!
    - button "Close"
  - paragraph:
    - text: Do you enjoy this platform? ❤️
    - link "Buy us a coffee":
      - /url: https://www.buymeacoffee.com/expandtesting
  - insertion:
    - iframe
  - navigation "breadcrumb mb-2":
    - list:
      - listitem:
        - link "Home":
          - /url: /
      - listitem: / Login Page
  - heading "Test Login page for Automation Testing Practice" [level=1]
  - paragraph:
    - text: This Test Login page is designed for automation testing practice. Test various positive and negative login scenarios in a testing environment.
    - link "Automation practice website":
      - img
      - text: Automation practice website
  - paragraph: You can use this login page for practicing with Selenium or other tools like Playwright, Cypress, etc.
  - paragraph:
    - text: Register
    - link "here":
      - /url: /register
    - text: "or Log in to the secure area with these credentials:"
  - list:
    - listitem: "Username: practice"
    - listitem: "Password: SuperSecretPassword!"
  - paragraph
  - text: Username
  - textbox "Username"
  - text: Password
  - textbox "Password"
  - button "Login"
  - heading "How to test the login page?" [level=2]
  - paragraph: If the credentials are correct, you should see a welcome message; otherwise, you will see an error message.
  - insertion:
    - iframe
  - paragraph:
    - text: The login feature is essential for secure websites and is commonly used. Automating the testing of various login scenarios, including different edge cases, is crucial to ensure reliability and security.
    - link "Login page tester":
      - img
      - text: Login page tester
  - heading "How Does Form-Based Authentication Work?" [level=3]
  - paragraph: "Take a look at this diagram and review the different steps:"
  - img "How Does Form-Based Authentication Work"
  - list:
    - listitem: "Step 1: A client requests access to a protected resource"
    - listitem: "Step 2: If the client is unauthenticated, the server redirects the client to a login page"
    - listitem: "Step 3: The client submits the login form to the server"
    - listitem: "Step 4: If the login succeeds, the server redirects the client to the resource. If the login fails, the client is redirected to an error page"
  - heading "Login Automation Test Cases" [level=2]
  - insertion:
    - heading "These are topics related to the article that might interest you" [level=2]: Discover more
    - link "Secure Networks"
    - link "Audit Security"
    - link "Try Cloud Tools"
  - paragraph:
    - text: Below are the test cases for the login page. These test cases cover both positive and negative scenarios to ensure comprehensive testing of the login functionality.
    - link "Login page tester":
      - img
      - text: Login page tester
  - paragraph:
    - text: To perform these tests, please navigate to this
    - link "page":
      - /url: /login
  - heading "Login Automation Test Cases" [level=2]
  - 'heading "Test Case 1: Successful Login" [level=3]'
  - list:
    - listitem: Launch the browser.
    - listitem:
      - text: Navigate to the
      - link "login":
        - /url: /login
      - text: page URL.
    - listitem: Verify that the login page is displayed successfully.
    - listitem:
      - text: Enter
      - strong: Username
      - text: ":"
      - code: practice
      - text: .
    - listitem:
      - text: Enter
      - strong: Password
      - text: ":"
      - code: SuperSecretPassword!
      - text: .
    - listitem:
      - text: Click the
      - strong: Login
      - text: button.
    - listitem:
      - text: Verify that the user is redirected to the
      - code: /secure
      - text: page.
    - listitem: Confirm the success message "You logged into a secure area!" is visible.
    - listitem:
      - text: Verify that a
      - strong: Logout
      - text: button is displayed.
  - separator
  - 'heading "Test Case 2: Invalid Username" [level=3]'
  - list:
    - listitem: Launch the browser.
    - listitem: Navigate to the login page URL.
    - listitem: Verify that the login page is displayed successfully.
    - listitem:
      - text: Enter an incorrect
      - strong: Username
      - text: (e.g.,
      - code: wrongUser
      - text: ).
    - listitem:
      - text: Enter
      - strong: Password
      - text: ":"
      - code: SuperSecretPassword!
      - text: .
    - listitem:
      - text: Click the
      - strong: Login
      - text: button.
    - listitem: Verify that an error message "Invalid username." is displayed.
    - listitem: Ensure the user remains on the login page.
  - separator
  - 'heading "Test Case 3: Invalid Password" [level=3]'
  - list:
    - listitem: Launch the browser.
    - listitem: Navigate to the login page URL.
    - listitem: Verify that the login page is displayed successfully.
    - listitem:
      - text: Enter
      - strong: Username
      - text: ":"
      - code: practice
      - text: .
    - listitem:
      - text: Enter an incorrect
      - strong: Password
      - text: (e.g.,
      - code: WrongPassword
      - text: ).
    - listitem:
      - text: Click the
      - strong: Login
      - text: button.
    - listitem: Verify that an error message "Invalid password." is displayed.
    - listitem: Ensure the user remains on the login page.
  - insertion:
    - heading "These are topics related to the article that might interest you" [level=2]: Discover more
    - link "Automation practice website"
    - link "Testing tools guide"
    - link "Login page tester"
    - link "Secure login service"
    - link "Software testing course"
    - link "API testing tools"
    - link "Automation testing platform"
    - link "Browse Reference"
- insertion:
  - heading "These are topics related to the article that might interest you" [level=2]: Discover more
  - link "Try Dev Tools"
  - link "Source Robotics"
  - link "Automation tool comparison"
- contentinfo:
  - heading "Practice Test Automation WebSite for Web UI and Rest API" [level=4]
  - paragraph:
    - text: "Version: e64cd80e | Copyright"
    - link "Expand Testing":
      - /url: https://expandtesting.com/
    - text: "2026"
    - link "Software testing course":
      - img
      - text: Software testing course
- img
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | // Define the test suite for login functionality
  4  | test('Perform Login Operation on Practice Expand Testing Login Page', async ({ page }) => {
  5  |   // Navigate to the login page
  6  |   await page.goto('https://practice.expandtesting.com/login');
  7  | 
  8  |   // Assert the page title
  9  |   await expect(page).toHaveTitle(/Test Login Page/);
  10 | 
  11 |   // Assert the presence of page headings
  12 |   const headings = [
  13 |     { tag: 'h1', text: 'Test Login page for Automation Testing Practice' },
  14 |     { tag: 'h2', text: 'How to test the login page?' },
  15 |     { tag: 'h3', text: 'How Does Form-Based Authentication Work?' },
  16 |     { tag: 'h2', text: 'Login Automation Test Cases' },
  17 |     { tag: 'h2', text: 'Login Automation Test Cases' },
  18 |     { tag: 'h3', text: 'Test Case 1: Successful Login' }
  19 |   ];
  20 | 
  21 |   // for (const heading of headings) {
  22 |   //   await expect(page.locator(heading.tag, { hasText: heading.text })).toBeVisible();
  23 |   // }
  24 | 
  25 |   // Assert the presence of inputs
  26 |   const inputs = [
  27 |     { selector: '#username', type: 'text', id: 'username', name: 'username', label: 'Username' },
  28 |     { selector: '#password', type: 'password', id: 'password', name: 'password', label: 'Password' }
  29 |   ];
  30 | 
  31 |   for (const input of inputs) {
  32 |     await expect(page.locator(input.selector)).toBeVisible();
  33 |   }
  34 | 
  35 |   // Assert the presence of button
  36 |   await expect(page.locator('#submit-login', { hasText: 'Login' })).toBeVisible();
  37 | 
  38 |   // Perform login operation with valid credentials
  39 |   await page.fill('#username', 'practice');
  40 |   await page.fill('#password', 'password');
  41 |   await page.click('#submit-login');
  42 | 
  43 |   // Assert the page title after successful login
> 44 |   await expect(page).toHaveTitle(/Welcome to the Secure Area/);
     |                      ^ Error: expect(page).toHaveTitle(expected) failed
  45 | 
  46 |   // Assert the presence of success message
  47 |   await expect(page.locator('#submit-login', { hasText: 'Logout' })).toBeVisible();
  48 | 
  49 |   // Perform login operation with invalid credentials
  50 |   await page.fill('#username', 'invalidUser');
  51 |   await page.fill('#password', 'invalidPassword');
  52 |   await page.click('#submit-login');
  53 | 
  54 |   // Assert the error message for invalid credentials
  55 |   await expect(page.locator('.error-message')).toContainText('Invalid username or password');
  56 | 
  57 |   // Handle loading states and dynamic content
  58 |   // This is a placeholder for potential handling of dynamic elements or loading states
  59 |   // For example, if elements are dynamically added or loaded, you might want to add checks here
  60 | 
  61 |   // Perform accessibility checks (example: checking if login button is keyboard accessible)
  62 |   // This is a placeholder for accessibility checks, you should implement actual checks based on your needs
  63 |   await expect(page.getByRole('button', { name: 'Login' })).toBeEnabled();
  64 |   await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  65 | });
  66 | 
  67 | // Test for async operations (e.g., waiting for page to load)
  68 | test.afterEach(async ({ page }) => {
  69 |   await page.waitForTimeout(1000); // Simulate a delay for async operations
  70 | });
  71 | 
```