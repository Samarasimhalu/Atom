# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-perform-login-operation-on-this-website-with-use.spec.ts >> Perform Login Operation on Practice Expand Testing Login Page
- Location: atom\ui-perform-login-operation-on-this-website-with-use.spec.ts:4:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('h2').filter({ hasText: 'Login Automation Test Cases' })
Expected: visible
Error: strict mode violation: locator('h2').filter({ hasText: 'Login Automation Test Cases' }) resolved to 2 elements:
    1) <h2>Login Automation Test Cases</h2> aka getByRole('heading', { name: 'Login Automation Test Cases' }).first()
    2) <h2 id="login-automation-test-cases">Login Automation Test Cases</h2> aka locator('#login-automation-test-cases')

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('h2').filter({ hasText: 'Login Automation Test Cases' })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - paragraph [ref=e3]:
    - link "PMP Practice" [ref=e4] [cursor=pointer]:
      - /url: https://pmp.expandtesting.com/
    - text: "| Free PMP Certification Mock Exam Test +900 Questions & Quizzes"
    - link "Software testing course" [ref=e5] [cursor=pointer]
  - banner [ref=e10]:
    - navigation "Main navigation" [ref=e11]:
      - link "SUT" [ref=e12] [cursor=pointer]:
        - /url: /
        - 'img "Best Website for Practice Automation Testing: Free UI and REST API Examples and Apps. Using Cypress, Playwright, Selenium, WebdriverIO and Postman." [ref=e13]'
        - text: Practice
      - generic [ref=e14]:
        - list [ref=e15]:
          - listitem [ref=e16]:
            - button "Demos" [ref=e17] [cursor=pointer]
          - listitem [ref=e18]:
            - link "Tools" [ref=e19] [cursor=pointer]:
              - /url: /#tools
          - listitem [ref=e20]:
            - link "Tips" [ref=e21] [cursor=pointer]:
              - /url: /tips
          - listitem [ref=e22]:
            - link "Test Cases" [ref=e23] [cursor=pointer]:
              - /url: /test-cases
          - listitem [ref=e24]:
            - link "API Testing" [ref=e25] [cursor=pointer]:
              - /url: /notes/api/api-docs/
          - listitem [ref=e26]:
            - link "About" [ref=e27] [cursor=pointer]:
              - /url: /about
        - list
        - link "Free ISTQB Mock Exams" [ref=e28] [cursor=pointer]:
          - /url: https://istqb.expandtesting.com/
  - main [ref=e29]:
    - paragraph [ref=e34]:
      - text: Do you enjoy this platform? ❤️
      - link "Buy us a coffee" [ref=e35] [cursor=pointer]:
        - /url: https://www.buymeacoffee.com/expandtesting
    - generic [ref=e36]:
      - insertion [ref=e38]:
        - generic [ref=e41]:
          - heading "These are topics related to the article that might interest you" [level=2] [ref=e43]: Discover more
          - link "Secure Networks" [ref=e44] [cursor=pointer]
          - link "Try Cloud Tools" [ref=e49] [cursor=pointer]
          - link "Try Dev Tools" [ref=e54] [cursor=pointer]
          - link "Audit Security" [ref=e59] [cursor=pointer]
          - link "Source Robotics" [ref=e64] [cursor=pointer]
          - link "Automation tool comparison" [ref=e69] [cursor=pointer]
          - link "Authentication methods guide" [ref=e74] [cursor=pointer]
          - link "Clean Your PC" [ref=e79] [cursor=pointer]
      - generic [ref=e85]:
        - generic [ref=e86]:
          - navigation "breadcrumb mb-2" [ref=e87]:
            - list [ref=e88]:
              - listitem [ref=e89]:
                - link "Home" [ref=e90] [cursor=pointer]:
                  - /url: /
              - listitem [ref=e91]: / Login Page
          - heading "Test Login page for Automation Testing Practice" [level=1] [ref=e92]
          - generic [ref=e94]:
            - paragraph [ref=e95]: This Test Login page is designed for automation testing practice. Test various positive and negative login scenarios in a testing environment.
            - paragraph [ref=e96]: You can use this login page for practicing with Selenium or other tools like Playwright, Cypress, etc.
            - paragraph [ref=e97]:
              - text: Register
              - link "here" [ref=e98] [cursor=pointer]:
                - /url: /register
              - text: "or Log in to the secure area with these credentials:"
            - list [ref=e99]:
              - listitem [ref=e100]: "Username: practice"
              - listitem [ref=e101]: "Password: SuperSecretPassword!"
            - paragraph
          - generic [ref=e106]:
            - generic [ref=e107]:
              - generic [ref=e108]:
                - generic [ref=e109]: Username
                - textbox "Username" [ref=e110]
              - generic [ref=e111]:
                - generic [ref=e112]: Password
                - textbox "Password" [ref=e113]
            - button "Login" [ref=e114] [cursor=pointer]
          - generic [ref=e115]:
            - heading "How to test the login page?" [level=2] [ref=e116]
            - generic [ref=e117]:
              - paragraph [ref=e118]: If the credentials are correct, you should see a welcome message; otherwise, you will see an error message.
              - paragraph [ref=e119]:
                - text: The login feature is essential for secure websites and is commonly used. Automating the testing of various login scenarios, including different edge cases, is crucial to ensure reliability and security.
                - link "Login page tester" [ref=e120] [cursor=pointer]
              - heading "How Does Form-Based Authentication Work?" [level=3] [ref=e124]
              - paragraph [ref=e125]: "Take a look at this diagram and review the different steps:"
              - img "How Does Form-Based Authentication Work" [ref=e126]
              - list [ref=e127]:
                - listitem [ref=e128]: "Step 1: A client requests access to a protected resource"
                - listitem [ref=e129]: "Step 2: If the client is unauthenticated, the server redirects the client to a login page"
                - listitem [ref=e130]: "Step 3: The client submits the login form to the server"
                - listitem [ref=e131]: "Step 4: If the login succeeds, the server redirects the client to the resource. If the login fails, the client is redirected to an error page"
        - generic [ref=e133]:
          - heading "Login Automation Test Cases" [level=2] [ref=e134]
          - insertion [ref=e136]:
            - generic [ref=e139]:
              - heading "These are topics related to the article that might interest you" [level=2] [ref=e141]: Discover more
              - link "Find Tech Guides" [ref=e142] [cursor=pointer]
              - link "Playwright automation course" [ref=e147] [cursor=pointer]
              - link "Cypress testing examples" [ref=e152] [cursor=pointer]
          - paragraph [ref=e157]:
            - text: Below are the test cases for the login page. These test cases cover both positive and negative scenarios to ensure comprehensive testing of the login functionality.
            - link "Login page tester" [ref=e158] [cursor=pointer]
          - paragraph [ref=e162]:
            - text: To perform these tests, please navigate to this
            - link "page" [ref=e163] [cursor=pointer]:
              - /url: /login
          - heading "Login Automation Test Cases" [level=2] [ref=e164]
          - 'heading "Test Case 1: Successful Login" [level=3] [ref=e165]'
          - list [ref=e166]:
            - listitem [ref=e167]: Launch the browser.
            - listitem [ref=e168]:
              - text: Navigate to the
              - link "login" [ref=e169] [cursor=pointer]:
                - /url: /login
              - text: page URL.
            - listitem [ref=e170]: Verify that the login page is displayed successfully.
            - listitem [ref=e171]:
              - text: Enter
              - strong [ref=e172]: Username
              - text: ":"
              - code [ref=e173]: practice
              - text: .
            - listitem [ref=e174]:
              - text: Enter
              - strong [ref=e175]: Password
              - text: ":"
              - code [ref=e176]: SuperSecretPassword!
              - text: .
            - listitem [ref=e177]:
              - text: Click the
              - strong [ref=e178]: Login
              - text: button.
            - listitem [ref=e179]:
              - text: Verify that the user is redirected to the
              - code [ref=e180]: /secure
              - text: page.
            - listitem [ref=e181]: Confirm the success message "You logged into a secure area!" is visible.
            - listitem [ref=e182]:
              - text: Verify that a
              - strong [ref=e183]: Logout
              - text: button is displayed.
          - separator [ref=e184]
          - 'heading "Test Case 2: Invalid Username" [level=3] [ref=e185]'
          - list [ref=e186]:
            - listitem [ref=e187]: Launch the browser.
            - listitem [ref=e188]: Navigate to the login page URL.
            - listitem [ref=e189]: Verify that the login page is displayed successfully.
            - listitem [ref=e190]:
              - text: Enter an incorrect
              - strong [ref=e191]: Username
              - text: (e.g.,
              - code [ref=e192]: wrongUser
              - text: ).
            - listitem [ref=e193]:
              - text: Enter
              - strong [ref=e194]: Password
              - text: ":"
              - code [ref=e195]: SuperSecretPassword!
              - text: .
            - listitem [ref=e196]:
              - text: Click the
              - strong [ref=e197]: Login
              - text: button.
            - listitem [ref=e198]: Verify that an error message "Invalid username." is displayed.
            - listitem [ref=e199]: Ensure the user remains on the login page.
          - separator [ref=e200]
          - 'heading "Test Case 3: Invalid Password" [level=3] [ref=e201]'
          - list [ref=e202]:
            - listitem [ref=e203]: Launch the browser.
            - listitem [ref=e204]: Navigate to the login page URL.
            - listitem [ref=e205]: Verify that the login page is displayed successfully.
            - listitem [ref=e206]:
              - text: Enter
              - strong [ref=e207]: Username
              - text: ":"
              - code [ref=e208]: practice
              - text: .
            - listitem [ref=e209]:
              - text: Enter an incorrect
              - strong [ref=e210]: Password
              - text: (e.g.,
              - code [ref=e211]: WrongPassword
              - text: ).
            - listitem [ref=e212]:
              - text: Click the
              - strong [ref=e213]: Login
              - text: button.
            - listitem [ref=e214]: Verify that an error message "Invalid password." is displayed.
            - listitem [ref=e215]: Ensure the user remains on the login page.
    - insertion [ref=e217]:
      - generic [ref=e220]:
        - heading "These are topics related to the article that might interest you" [level=2] [ref=e222]: Discover more
        - link "Automation practice website" [ref=e223] [cursor=pointer]
        - link "Testing tools guide" [ref=e228] [cursor=pointer]
        - link "Login page tester" [ref=e233] [cursor=pointer]
        - link "Secure login service" [ref=e238] [cursor=pointer]
        - link "Software testing course" [ref=e243] [cursor=pointer]
        - link "API testing tools" [ref=e248] [cursor=pointer]
        - link "Automation testing platform" [ref=e253] [cursor=pointer]
        - link "Browse Reference" [ref=e258] [cursor=pointer]
  - insertion [ref=e264]:
    - generic [ref=e267]:
      - heading "These are topics related to the article that might interest you" [level=2] [ref=e269]: Discover more
      - link "Scenario testing workshop" [ref=e270] [cursor=pointer]
      - link "Learn to Code" [ref=e275] [cursor=pointer]
      - link "Compare Browsers" [ref=e280] [cursor=pointer]
  - contentinfo [ref=e285]:
    - generic [ref=e290]:
      - heading "Practice Test Automation WebSite for Web UI and Rest API" [level=4] [ref=e291]
      - paragraph [ref=e292]:
        - text: "Version: e64cd80e | Copyright"
        - link "Expand Testing" [ref=e293] [cursor=pointer]:
          - /url: https://expandtesting.com/
        - text: "2026"
        - link "Software testing course" [ref=e294] [cursor=pointer]
  - generic [ref=e298] [cursor=pointer]
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
  21 |   for (const heading of headings) {
> 22 |     await expect(page.locator(heading.tag, { hasText: heading.text })).toBeVisible();
     |                                                                        ^ Error: expect(locator).toBeVisible() failed
  23 |   }
  24 | 
  25 |   // Assert the presence of inputs
  26 |   const inputs = [
  27 |     { selector: '#username', type: 'text', id: 'username', name: 'username', label: 'Username' },
  28 |     { selector: '#password', type: 'password', id: 'password', name: 'password', label: 'Password' }
  29 |   ];
  30 | 
  31 |   for (const input of inputs) {
  32 |     await expect(page.locator(input.selector, { hasValue: input.label })).toBeVisible();
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
  44 |   await expect(page).toHaveTitle(/Welcome to the Secure Area/);
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