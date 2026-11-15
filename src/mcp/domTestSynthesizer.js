const { extractTargetUrlsFromPrompt } = require('./webInspector');

function escapeJsSingle(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ');
}

function escapeJsRegexLiteral(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function extractDemoCredentialsFromHints(textHints) {
  const hints = String(textHints || '');
  if (!hints) return {};

  const userMatch = hints.match(/\b(?:username|user(?:\s*name)?|email)\s*[:=]\s*["'`]?([a-zA-Z0-9._@+-]{3,64})["'`]?/i);
  const passMatch = hints.match(/\b(?:password|pass)\s*[:=]\s*["'`]?([^\s"'`<>\n]{4,64})["'`]?/i);

  return {
    username: userMatch ? userMatch[1] : null,
    password: passMatch ? passMatch[1] : null
  };
}

function scoreButtonMatch(button, promptLower, isAuth, isSearch) {
  const haystack = `${button.text} ${button.id} ${button.name} ${button.ariaLabel} ${button.type}`.toLowerCase();
  let score = 0;
  if (button.type === 'submit') score += 4;
  if (isAuth && /\b(log ?in|sign ?in|submit|continue|authenticate)\b/.test(haystack)) score += 10;
  if (isSearch && /\b(search|find|go|submit)\b/.test(haystack)) score += 10;
  for (const word of promptLower.split(/\s+/)) {
    if (word.length >= 3 && haystack.includes(word)) score += 3;
  }
  if (/\b(logout|sign out|cancel|reset|close|dismiss|cookie)\b/.test(haystack)) score -= 8;
  return score;
}

function pickBestSubmitButton(buttons, forms, promptLower, isAuth, isSearch) {
  const formSubmit = (forms || []).find(f => f.submitSelector)?.submitSelector;
  const list = Array.isArray(buttons) ? buttons : [];
  let best = null;
  let bestScore = -Infinity;
  for (const btn of list) {
    const score = scoreButtonMatch(btn, promptLower, isAuth, isSearch);
    if (score > bestScore) {
      bestScore = score;
      best = btn;
    }
  }
  if (best && bestScore > 0) return best;
  if (formSubmit) return { selector: formSubmit, text: 'Submit' };
  return best;
}

function inferSampleValueForInput(input, promptLower, demoCreds) {
  const descriptor = `${input.type} ${input.name} ${input.id} ${input.placeholder} ${input.label} ${input.autocomplete}`.toLowerCase();

  if (input.type === 'password' || /\b(password|passcode|pwd)\b/.test(descriptor)) {
    return demoCreds.password || 'SuperSecretPassword!';
  }
  if (input.type === 'email' || /\b(e-?mail)\b/.test(descriptor)) {
    return demoCreds.username && demoCreds.username.includes('@')
      ? demoCreds.username
      : 'test.user@example.com';
  }
  if (/\b(user|username|login|account|handle)\b/.test(descriptor)) {
    return demoCreds.username || 'practice';
  }
  if (input.type === 'search' || /\b(search|query|keyword|find)\b/.test(descriptor)) {
    const cleaned = promptLower.replace(/https?:\/\/\S+/g, '').replace(/\b(search|find|for|on|test|create|verify|ui|case)\b/g, ' ').replace(/\s+/g, ' ').trim();
    return (cleaned || 'automation').slice(0, 40);
  }
  if (input.type === 'tel' || /\b(phone|mobile|tel)\b/.test(descriptor)) {
    return '5550192834';
  }
  if (input.type === 'number') {
    return '1';
  }
  if (/\b(first.?name|fname)\b/.test(descriptor)) return 'Alex';
  if (/\b(last.?name|lname)\b/.test(descriptor)) return 'Rivera';
  if (/\b(full.?name|name)\b/.test(descriptor)) return 'Alex Rivera';
  if (input.tag === 'textarea' || /\b(comment|message|notes|description|bio)\b/.test(descriptor)) {
    return 'Automated Playwright verification scenario';
  }
  return 'sample-value';
}

function filterRelevantInputs(inputs, promptLower, isAuth, isSearch) {
  const usable = (inputs || []).filter(inp => !['checkbox', 'radio', 'file', 'color', 'range'].includes(inp.type));
  if (isAuth) {
    const authInputs = usable.filter(inp => {
      const desc = `${inp.type} ${inp.name} ${inp.id} ${inp.placeholder} ${inp.label} ${inp.autocomplete}`.toLowerCase();
      return inp.type === 'password' || inp.type === 'email' || /\b(user|username|email|login|pass|account)\b/.test(desc);
    });
    if (authInputs.length > 0) return authInputs.slice(0, 6);
  }
  if (isSearch) {
    const searchInputs = usable.filter(inp => {
      const desc = `${inp.type} ${inp.name} ${inp.id} ${inp.placeholder} ${inp.label}`.toLowerCase();
      return inp.type === 'search' || /\b(search|query|q|keyword)\b/.test(desc);
    });
    if (searchInputs.length > 0) return searchInputs.slice(0, 3);
  }
  return usable.slice(0, 8);
}

function buildInspectedUiSpec({ prompt, targetUrl, inspectedDom }) {
  const url = inspectedDom?.finalUrl || inspectedDom?.url || targetUrl || 'https://example.com';
  const promptLower = String(prompt || '').toLowerCase();
  const cleanPrompt = escapeJsSingle(String(prompt || 'UI Scenario').replace(/\s+/g, ' ').slice(0, 110));
  let hostname = 'target-app';
  let pathname = '/';
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    pathname = parsed.pathname || '/';
  } catch (_) {
    // keep defaults
  }

  const inputs = Array.isArray(inspectedDom?.inputs) ? inspectedDom.inputs : [];
  const buttons = Array.isArray(inspectedDom?.buttons) ? inspectedDom.buttons : [];
  const selects = Array.isArray(inspectedDom?.selects) ? inspectedDom.selects : [];
  const headings = Array.isArray(inspectedDom?.headings) ? inspectedDom.headings : [];
  const links = Array.isArray(inspectedDom?.links) ? inspectedDom.links : [];
  const forms = Array.isArray(inspectedDom?.forms) ? inspectedDom.forms : [];

  const hasPasswordInput = inputs.some(i => i.type === 'password');
  const isAuth = hasPasswordInput || /\b(login|log in|signin|sign in|authenticate|credentials|password|username)\b/.test(promptLower);
  const isSearch = /\b(search|filter|query|find)\b/.test(promptLower);
  const demoCreds = extractDemoCredentialsFromHints(`${prompt || ''}\n${inspectedDom?.textHints || ''}`);

  const chosenInputs = filterRelevantInputs(inputs, promptLower, isAuth, isSearch);
  const submitButton = pickBestSubmitButton(buttons, forms, promptLower, isAuth, isSearch);

  const lines = [
    "import { test, expect } from '@playwright/test';",
    '',
    `// ATOM Live DOM-Inspected Playwright UI Spec (${inspectedDom?.method || 'url-targeted'})`,
    `// Scenario: ${cleanPrompt}`,
    `// Inspected URL: ${url}`,
    `test.describe('${escapeJsSingle(hostname)} — ${cleanPrompt}', () => {`,
    `  test('executes user flow against inspected elements on ${escapeJsSingle(hostname)}', async ({ page }) => {`,
    `    await page.goto('${escapeJsSingle(url)}', { waitUntil: 'domcontentloaded' });`
  ];

  if (headings.length > 0 && headings[0].text) {
    const tag = headings[0].tag;
    const selector = ['h1', 'h2'].includes(tag) ? 'h1, h2' : `${tag}, h1, h2`;
    lines.push(
      `    await expect(page.locator('${selector}').first()).toBeVisible();`
    );
  }

  if (chosenInputs.length > 0) {
    lines.push('');
    lines.push('    // Fill inspected form fields from live DOM');
    chosenInputs.forEach((inp, idx) => {
      const varName = `field${idx + 1}`;
      const sampleVal = inferSampleValueForInput(inp, promptLower, demoCreds);
      lines.push(`    const ${varName} = page.locator('${escapeJsSingle(inp.selector)}').first();`);
      lines.push(`    await expect(${varName}).toBeVisible();`);
      lines.push(`    await ${varName}.fill('${escapeJsSingle(sampleVal)}');`);
    });
  }

  if (!isAuth && selects.length > 0) {
    const firstSelect = selects[0];
    const validOpt = (firstSelect.options || []).find(o => o.value);
    if (validOpt) {
      lines.push('');
      lines.push(`    const selectControl = page.locator('${escapeJsSingle(firstSelect.selector)}').first();`);
      lines.push(`    await expect(selectControl).toBeVisible();`);
      lines.push(`    await selectControl.selectOption('${escapeJsSingle(validOpt.value)}');`);
    }
  }

  if (submitButton && submitButton.selector && (chosenInputs.length > 0 || !isAuth)) {
    lines.push('');
    lines.push('    // Trigger inspected action button');
    lines.push(`    const actionBtn = page.locator('${escapeJsSingle(submitButton.selector)}').first();`);
    lines.push('    await expect(actionBtn).toBeVisible();');
    lines.push('    await actionBtn.click();');
  } else if (chosenInputs.length === 0 && links.length > 0) {
    const matchedLink = links.find(l => promptLower.split(/\s+/).some(w => w.length >= 4 && l.text.toLowerCase().includes(w))) || links[0];
    if (matchedLink) {
      lines.push('');
      lines.push(`    const navLink = page.locator('${escapeJsSingle(matchedLink.selector)}').first();`);
      lines.push('    await expect(navLink).toBeVisible();');
      lines.push('    await navLink.click();');
    }
  }

  lines.push('');
  lines.push('    // Post-action verification');
  lines.push('    await page.waitForLoadState(\'domcontentloaded\');');
  if (isAuth && /login|signin|auth/i.test(pathname)) {
    lines.push(`    await expect(page).not.toHaveURL(/${escapeJsRegexLiteral(pathname)}$/i);`);
  }
  lines.push("    await expect(page.locator('body')).toBeVisible();");
  lines.push('  });');
  lines.push('});');

  return {
    code: lines.join('\n'),
    summary: `Generated Playwright UI test targeting ${url} using ${chosenInputs.length} inspected input selector(s) and ${submitButton ? `action selector "${submitButton.selector}"` : 'live DOM navigation assertions'}.`
  };
}

function buildVisualSpec({ prompt, targetUrl, inspectedDom }) {
  const url = inspectedDom?.finalUrl || inspectedDom?.url || targetUrl || 'https://example.com';
  const cleanPrompt = escapeJsSingle(String(prompt || 'Visual Regression').replace(/\s+/g, ' ').slice(0, 110));
  const code = [
    "import { test, expect } from '@playwright/test';",
    '',
    `// ATOM Live Visual Spec`,
    `// Scenario: ${cleanPrompt}`,
    `test.describe('Visual Check — ${cleanPrompt}', () => {`,
    `  test('verifies desktop and mobile rendering on ${escapeJsSingle(url)}', async ({ page }, testInfo) => {`,
    "    await page.setViewportSize({ width: 1280, height: 800 });",
    `    await page.goto('${escapeJsSingle(url)}', { waitUntil: 'domcontentloaded' });`,
    "    await expect(page.locator('body')).toBeVisible();",
    "    await page.screenshot({ path: testInfo.outputPath('desktop-view.png'), fullPage: true });",
    '',
    "    await page.setViewportSize({ width: 390, height: 844 });",
    "    await expect(page.locator('body')).toBeVisible();",
    "    await page.screenshot({ path: testInfo.outputPath('mobile-view.png'), fullPage: true });",
    '  });',
    '});'
  ].join('\n');

  return {
    code,
    summary: `Generated responsive desktop & mobile Playwright visual test for ${url}.`
  };
}

function buildApiSpec({ prompt, targetUrl }) {
  const url = targetUrl || 'http://127.0.0.1:3001/api/health';
  const cleanPrompt = escapeJsSingle(String(prompt || 'API Check').replace(/\s+/g, ' ').slice(0, 110));
  const code = [
    "import { test, expect } from '@playwright/test';",
    '',
    `// ATOM API Spec`,
    `// Scenario: ${cleanPrompt}`,
    `test.describe('API Verification — ${cleanPrompt}', () => {`,
    `  test('validates HTTP response from ${escapeJsSingle(url)}', async ({ request }) => {`,
    `    const response = await request.get('${escapeJsSingle(url)}');`,
    '    expect(response.status()).toBeLessThan(400);',
    '    const text = await response.text();',
    '    expect(text.length).toBeGreaterThan(0);',
    '  });',
    '});'
  ].join('\n');

  return {
    code,
    summary: `Generated Playwright API verification test targeting ${url}.`
  };
}

function buildMobileSpec({ prompt, options = {} }) {
  const platform = options.mobile?.platform === 'ios' ? 'ios' : 'android';
  const cleanPrompt = escapeJsSingle(String(prompt || 'Mobile Flow').replace(/\s+/g, ' ').slice(0, 110));
  const code = [
    "import { browser, $, expect } from '@wdio/globals';",
    '',
    `// ATOM Managed Appium ${platform.toUpperCase()} Spec`,
    `// Scenario: ${cleanPrompt}`,
    `describe('${cleanPrompt}', () => {`,
    `  it('runs governed native ${platform} assertion via injected session', async () => {`,
    "    const rootAction = await $('~primary-action');",
    '    await rootAction.waitForDisplayed({ timeout: 10000 });',
    '    await rootAction.click();',
    "    const confirmation = await $('~status-banner');",
    '    await expect(confirmation).toBeDisplayed();',
    "    await browser.saveScreenshot('/results/mobile-step.png');",
    '  });',
    '});'
  ].join('\n');

  return {
    code,
    summary: `Generated managed WebdriverIO ${platform} mobile test for: ${cleanPrompt}`
  };
}

function synthesizeTestFromDom({ prompt, testType = 'ui', targetUrl = '', inspectedDom = null, options = {} } = {}) {
  const urls = targetUrl ? [targetUrl] : extractTargetUrlsFromPrompt(prompt);
  const resolvedUrl = inspectedDom?.finalUrl || inspectedDom?.url || urls[0] || '';

  if (testType === 'mobile') {
    return buildMobileSpec({ prompt, options });
  }
  if (testType === 'api') {
    return buildApiSpec({ prompt, targetUrl: resolvedUrl });
  }
  if (testType === 'visual') {
    return buildVisualSpec({ prompt, targetUrl: resolvedUrl, inspectedDom });
  }
  return buildInspectedUiSpec({ prompt, targetUrl: resolvedUrl, inspectedDom });
}

module.exports = {
  extractDemoCredentialsFromHints,
  synthesizeTestFromDom
};
