const fs = require('node:fs');

const BLOCKED_METADATA_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.goog',
  '100.100.100.200'
]);

function extractTargetUrlsFromPrompt(prompt) {
  const text = String(prompt || '');
  const urls = [];
  const seen = new Set();

  const fullUrlRe = /\bhttps?:\/\/[^\s"'`<>()[\]]+/gi;
  for (const match of text.matchAll(fullUrlRe)) {
    const cleaned = match[0].replace(/[.,;:!?]+$/, '');
    try {
      const parsed = new URL(cleaned);
      const href = parsed.toString();
      if (!seen.has(href)) {
        seen.add(href);
        urls.push(href);
      }
    } catch (_) {
      // ignore invalid URL token
    }
  }

  if (urls.length === 0) {
    const bareDomainRe = /\b([a-z0-9-]+(?:\.[a-z0-9-]+)+\/[a-zA-Z0-9_./?=&%+-]*)/gi;
    for (const match of text.matchAll(bareDomainRe)) {
      const token = match[1].replace(/[.,;:!?]+$/, '');
      if (/\.(spec|test)\.(ts|js|tsx|jsx)$/i.test(token)) continue;
      if (/\.(ts|js|json|png|jpg|md|css|html)$/i.test(token)) continue;
      try {
        const parsed = new URL(`https://${token}`);
        const href = parsed.toString();
        if (!seen.has(href)) {
          seen.add(href);
          urls.push(href);
        }
      } catch (_) {
        // ignore invalid domain token
      }
    }
  }

  return urls;
}

function validateInspectableUrl(rawUrl) {
  const parsed = new URL(String(rawUrl || '').trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('inspect_url_must_be_http_or_https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('inspect_url_credentials_not_allowed');
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_METADATA_HOSTS.has(host)) {
    throw new Error('inspect_metadata_host_blocked');
  }
  return parsed.toString();
}

function buildSelector({ tag, id, name, dataTestId, type, ariaLabel, text }) {
  if (dataTestId) return `[data-testid="${dataTestId}"]`;
  if (id && /^[a-zA-Z_][\w:-]*$/.test(id)) return `#${id}`;
  if (name) return `${tag || '*'}[name="${name}"]`;
  if (ariaLabel) return `${tag || '*'}[aria-label="${ariaLabel}"]`;
  if (tag === 'button' && text) return `button:has-text("${text.replace(/"/g, '\\"').slice(0, 48)}")`;
  if (tag === 'input' && type) return `input[type="${type}"]`;
  return tag || 'div';
}

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html) {
  return decodeHtmlEntities(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseAttributes(attrString) {
  const attrs = {};
  const re = /([a-zA-Z0-9_:-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const m of String(attrString || '').matchAll(re)) {
    const key = m[1].toLowerCase();
    const val = m[2] ?? m[3] ?? m[4] ?? '';
    attrs[key] = decodeHtmlEntities(val);
  }
  return attrs;
}

function parseHtmlToInspection(html, url) {
  const src = String(html || '');
  const titleMatch = src.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : '';

  const labelByFor = new Map();
  for (const m of src.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) {
    const attrs = parseAttributes(m[1]);
    const text = stripTags(m[2]);
    if (attrs.for && text) labelByFor.set(attrs.for, text);
  }

  const headings = [];
  for (const m of src.matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = stripTags(m[2]);
    if (text && headings.length < 8) headings.push({ tag: m[1].toLowerCase(), text });
  }

  const inputs = [];
  for (const m of src.matchAll(/<(input|textarea)\b([^>]*)>/gi)) {
    if (inputs.length >= 25) break;
    const tag = m[1].toLowerCase();
    const attrs = parseAttributes(m[2]);
    const type = (attrs.type || (tag === 'textarea' ? 'textarea' : 'text')).toLowerCase();
    if (type === 'hidden') continue;
    const label = (attrs.id && labelByFor.get(attrs.id)) || attrs['aria-label'] || attrs.placeholder || attrs.name || attrs.id || '';
    const selector = buildSelector({
      tag,
      id: attrs.id,
      name: attrs.name,
      dataTestId: attrs['data-testid'],
      type,
      ariaLabel: attrs['aria-label']
    });
    if (['submit', 'button', 'reset'].includes(type)) continue;
    inputs.push({
      tag,
      type,
      id: attrs.id || '',
      name: attrs.name || '',
      placeholder: attrs.placeholder || '',
      label,
      ariaLabel: attrs['aria-label'] || '',
      dataTestId: attrs['data-testid'] || '',
      autocomplete: attrs.autocomplete || '',
      required: Object.prototype.hasOwnProperty.call(attrs, 'required'),
      selector
    });
  }

  const buttons = [];
  for (const m of src.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    if (buttons.length >= 20) break;
    const attrs = parseAttributes(m[1]);
    const text = stripTags(m[2]);
    buttons.push({
      tag: 'button',
      type: (attrs.type || 'submit').toLowerCase(),
      id: attrs.id || '',
      name: attrs.name || '',
      text,
      ariaLabel: attrs['aria-label'] || '',
      dataTestId: attrs['data-testid'] || '',
      selector: buildSelector({
        tag: 'button',
        id: attrs.id,
        name: attrs.name,
        dataTestId: attrs['data-testid'],
        type: attrs.type,
        ariaLabel: attrs['aria-label'],
        text
      })
    });
  }

  for (const m of src.matchAll(/<input\b([^>]*)>/gi)) {
    if (buttons.length >= 20) break;
    const attrs = parseAttributes(m[1]);
    const type = (attrs.type || '').toLowerCase();
    if (!['submit', 'button'].includes(type)) continue;
    const text = attrs.value || attrs['aria-label'] || type;
    buttons.push({
      tag: 'input',
      type,
      id: attrs.id || '',
      name: attrs.name || '',
      text,
      ariaLabel: attrs['aria-label'] || '',
      dataTestId: attrs['data-testid'] || '',
      selector: buildSelector({
        tag: 'input',
        id: attrs.id,
        name: attrs.name,
        dataTestId: attrs['data-testid'],
        type,
        ariaLabel: attrs['aria-label'],
        text
      })
    });
  }

  const selects = [];
  for (const m of src.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    if (selects.length >= 10) break;
    const attrs = parseAttributes(m[1]);
    const options = [];
    for (const opt of m[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
      const oAttrs = parseAttributes(opt[1]);
      options.push({ value: oAttrs.value ?? stripTags(opt[2]), text: stripTags(opt[2]) });
    }
    selects.push({
      id: attrs.id || '',
      name: attrs.name || '',
      label: (attrs.id && labelByFor.get(attrs.id)) || attrs['aria-label'] || attrs.name || '',
      selector: buildSelector({ tag: 'select', id: attrs.id, name: attrs.name, dataTestId: attrs['data-testid'] }),
      options: options.slice(0, 12)
    });
  }

  const links = [];
  for (const m of src.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (links.length >= 20) break;
    const attrs = parseAttributes(m[1]);
    const text = stripTags(m[2]);
    if (!attrs.href || !text) continue;
    links.push({
      text: text.slice(0, 80),
      href: attrs.href,
      id: attrs.id || '',
      selector: attrs.id ? `#${attrs.id}` : `a:has-text("${text.replace(/"/g, '\\"').slice(0, 48)}")`
    });
  }

  const textHints = stripTags(src).slice(0, 1200);

  return {
    url,
    finalUrl: url,
    method: 'http-html-scraper',
    title,
    headings,
    inputs,
    selects,
    buttons,
    links,
    forms: [],
    textHints
  };
}

function loadPlaywrightCore() {
  try {
    return require('playwright-core');
  } catch (_) {
    try {
      return require('@playwright/test');
    } catch (__) {
      return null;
    }
  }
}

async function inspectWithPlaywright(targetUrl, timeoutMs) {
  const pw = loadPlaywrightCore();
  if (!pw?.chromium) return null;
  const exePath = typeof pw.chromium.executablePath === 'function' ? pw.chromium.executablePath() : '';
  if (exePath && !fs.existsSync(exePath)) return null;

  const browser = await pw.chromium.launch({ headless: true, timeout: Math.min(timeoutMs, 10000) });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});

    const dom = await page.evaluate(() => {
      const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
      const isVisible = el => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 || rect.height > 0;
      };
      const bestSelector = el => {
        const testId = el.getAttribute('data-testid');
        if (testId) return `[data-testid="${testId}"]`;
        if (el.id && /^[a-zA-Z_][\w:-]*$/.test(el.id)) return `#${el.id}`;
        const name = el.getAttribute('name');
        const tag = el.tagName.toLowerCase();
        if (name) return `${tag}[name="${name}"]`;
        const aria = el.getAttribute('aria-label');
        if (aria) return `${tag}[aria-label="${aria}"]`;
        if (tag === 'button') {
          const t = clean(el.innerText || el.textContent);
          if (t) return `button:has-text("${t.replace(/"/g, '\\"').slice(0, 48)}")`;
        }
        const type = el.getAttribute('type');
        if (tag === 'input' && type) return `input[type="${type}"]`;
        return tag;
      };
      const findLabel = el => {
        if (el.id) {
          const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (lbl) return clean(lbl.innerText);
        }
        const wrapped = el.closest('label');
        if (wrapped) return clean(wrapped.innerText);
        return clean(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '');
      };

      const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .filter(isVisible)
        .slice(0, 8)
        .map(el => ({ tag: el.tagName.toLowerCase(), text: clean(el.innerText) }))
        .filter(h => h.text);

      const inputs = [];
      const buttons = [];
      for (const el of document.querySelectorAll('input, textarea')) {
        if (!isVisible(el)) continue;
        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || (tag === 'textarea' ? 'textarea' : 'text')).toLowerCase();
        if (type === 'hidden') continue;
        if (type === 'submit' || type === 'button' || type === 'reset') {
          if (buttons.length < 20) {
            buttons.push({
              tag,
              type,
              id: el.id || '',
              name: el.getAttribute('name') || '',
              text: clean(el.value || el.getAttribute('aria-label') || type),
              ariaLabel: el.getAttribute('aria-label') || '',
              dataTestId: el.getAttribute('data-testid') || '',
              selector: bestSelector(el)
            });
          }
          continue;
        }
        if (inputs.length < 25) {
          inputs.push({
            tag,
            type,
            id: el.id || '',
            name: el.getAttribute('name') || '',
            placeholder: el.getAttribute('placeholder') || '',
            label: findLabel(el),
            ariaLabel: el.getAttribute('aria-label') || '',
            dataTestId: el.getAttribute('data-testid') || '',
            autocomplete: el.getAttribute('autocomplete') || '',
            required: el.hasAttribute('required'),
            selector: bestSelector(el)
          });
        }
      }

      for (const el of document.querySelectorAll('button, [role="button"]')) {
        if (!isVisible(el) || buttons.length >= 20) continue;
        buttons.push({
          tag: el.tagName.toLowerCase(),
          type: (el.getAttribute('type') || 'button').toLowerCase(),
          id: el.id || '',
          name: el.getAttribute('name') || '',
          text: clean(el.innerText || el.getAttribute('aria-label') || ''),
          ariaLabel: el.getAttribute('aria-label') || '',
          dataTestId: el.getAttribute('data-testid') || '',
          selector: bestSelector(el)
        });
      }

      const selects = Array.from(document.querySelectorAll('select'))
        .filter(isVisible)
        .slice(0, 10)
        .map(el => ({
          id: el.id || '',
          name: el.getAttribute('name') || '',
          label: findLabel(el),
          selector: bestSelector(el),
          options: Array.from(el.options).slice(0, 12).map(o => ({ value: o.value, text: clean(o.text) }))
        }));

      const links = Array.from(document.querySelectorAll('a[href]'))
        .filter(isVisible)
        .slice(0, 20)
        .map(el => {
          const text = clean(el.innerText);
          return {
            text: text.slice(0, 80),
            href: el.getAttribute('href') || '',
            id: el.id || '',
            selector: el.id ? `#${el.id}` : `a:has-text("${text.replace(/"/g, '\\"').slice(0, 48)}")`
          };
        })
        .filter(l => l.text);

      const forms = Array.from(document.querySelectorAll('form'))
        .filter(isVisible)
        .slice(0, 8)
        .map(form => ({
          id: form.id || '',
          action: form.getAttribute('action') || '',
          method: (form.getAttribute('method') || 'get').toLowerCase(),
          inputSelectors: Array.from(form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select')).map(bestSelector),
          submitSelector: (() => {
            const sub = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
            return sub ? bestSelector(sub) : '';
          })()
        }));

      const hintNodes = document.querySelectorAll('main, form, .alert, [role="alert"], .card, section, li, p');
      const hintParts = [];
      let totalLen = 0;
      for (const node of hintNodes) {
        if (!isVisible(node)) continue;
        const txt = clean(node.innerText);
        if (!txt || txt.length > 260) continue;
        if (!hintParts.includes(txt)) {
          hintParts.push(txt);
          totalLen += txt.length;
          if (totalLen >= 1000) break;
        }
      }

      return {
        finalUrl: window.location.href,
        title: document.title || '',
        headings,
        inputs,
        selects,
        buttons,
        links,
        forms,
        textHints: hintParts.join('\n').slice(0, 1200)
      };
    });

    return {
      url: targetUrl,
      method: 'playwright-chromium',
      ...dom
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function inspectWebsiteDom(rawUrl, { fetchImpl = fetch, timeoutMs = 15000, onLog, skipPlaywright = false } = {}) {
  const targetUrl = validateInspectableUrl(rawUrl);
  const log = msg => {
    if (onLog) onLog({ timestamp: new Date().toISOString(), stream: 'stdout', content: msg });
  };

  log(`[DOM Inspector] Navigating to ${targetUrl} to inspect live elements...`);

  if (!skipPlaywright) {
    try {
      const pwDom = await inspectWithPlaywright(targetUrl, timeoutMs);
      if (pwDom) {
        log(
          `[DOM Inspector] Inspected "${pwDom.title || targetUrl}" via Chromium (${pwDom.inputs.length} inputs, ${pwDom.buttons.length} buttons, ${pwDom.links.length} links).`
        );
        return pwDom;
      }
    } catch (error) {
      log(`[DOM Inspector] Browser inspect fallback (${error.message}); fetching HTML directly...`);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(targetUrl, {
      headers: {
        'User-Agent': 'ATOM-Inspector/1.0',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`inspect_http_${response.status}`);
    }
    const contentType = response.headers?.get?.('content-type') || '';
    const rawBody = await response.text();
    if (contentType.includes('application/json')) {
      return {
        url: targetUrl,
        finalUrl: targetUrl,
        method: 'http-json-inspector',
        title: '',
        headings: [],
        inputs: [],
        selects: [],
        buttons: [],
        links: [],
        forms: [],
        jsonSample: rawBody.slice(0, 1200),
        textHints: rawBody.slice(0, 600)
      };
    }
    const parsed = parseHtmlToInspection(rawBody, targetUrl);
    log(
      `[DOM Inspector] Scraped "${parsed.title || targetUrl}" (${parsed.inputs.length} inputs, ${parsed.buttons.length} buttons, ${parsed.links.length} links).`
    );
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  extractTargetUrlsFromPrompt,
  validateInspectableUrl,
  parseHtmlToInspection,
  inspectWebsiteDom
};
