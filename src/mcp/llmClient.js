const crypto = require('node:crypto');
const { synthesizeTestFromDom } = require('./domTestSynthesizer');

const LLM_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    keyPrefixHint: 'sk-...',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4', 'gpt-3.5-turbo']
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    keyPrefixHint: 'sk-ant-...',
    defaultModel: 'claude-sonnet-4-20250514',
    models: ['claude-sonnet-4-20250514', 'claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest']
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    keyPrefixHint: 'AIza...',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash']
  }
];

const SECRET_PATTERN = /(authorization|api[-_]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi;

function redactSensitiveText(value) {
  return String(value || '').replace(SECRET_PATTERN, '$1=[REDACTED]');
}

function detectProviderFromKey(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) return null;
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('AIza')) return 'google';
  if (key.startsWith('sk-')) return 'openai';
  return null;
}

function resolveProviderConfig({ provider, model, apiKey } = {}) {
  const cleanKey = String(apiKey || '').trim();
  const detected = detectProviderFromKey(cleanKey);
  const requested = provider && provider !== 'auto' ? String(provider).toLowerCase() : null;
  if (requested === 'free' || (!cleanKey && (!requested || requested === 'fallback'))) {
    return {
      provider: 'free',
      model: model && model !== 'atom-template' ? String(model).trim() : 'atom-free-dom',
      apiKey: ''
    };
  }
  const resolvedId = requested && LLM_PROVIDERS.some(p => p.id === requested)
    ? requested
    : (detected || 'free');

  const meta = LLM_PROVIDERS.find(p => p.id === resolvedId) || null;
  if (!meta) {
    return {
      provider: 'free',
      model: 'atom-free-dom',
      apiKey: ''
    };
  }

  const chosenModel = model && meta.models.includes(model)
    ? model
    : (model && resolvedId === requested ? String(model).trim() : meta.defaultModel);

  return {
    provider: meta.id,
    model: chosenModel || meta.defaultModel,
    apiKey: cleanKey
  };
}

function formatInspectedDomContext(inspectedDom) {
  if (!inspectedDom || typeof inspectedDom !== 'object') return '';
  const summary = {
    url: inspectedDom.finalUrl || inspectedDom.url,
    title: inspectedDom.title || '',
    headings: (inspectedDom.headings || []).slice(0, 6),
    inputs: (inspectedDom.inputs || []).slice(0, 15).map(i => ({
      selector: i.selector,
      type: i.type,
      id: i.id,
      name: i.name,
      label: i.label,
      placeholder: i.placeholder
    })),
    buttons: (inspectedDom.buttons || []).slice(0, 12).map(b => ({
      selector: b.selector,
      type: b.type,
      text: b.text,
      id: b.id
    })),
    selects: (inspectedDom.selects || []).slice(0, 5),
    links: (inspectedDom.links || []).slice(0, 8),
    visiblePageHints: String(inspectedDom.textHints || '').slice(0, 600)
  };
  return `\n\nLive Inspected Website DOM (use these exact selectors and target URL, do NOT invent atomworld.net URLs):\n${JSON.stringify(summary, null, 2)}`;
}

async function callFreeAiModel({ systemPrompt, userPrompt, model, fetchImpl = fetch }) {
  // 1. Try local Ollama first if running on localhost:11434
  try {
    const tagsRes = await fetchImpl('http://127.0.0.1:11434/api/tags', {
      signal: AbortSignal.timeout(500)
    });
    if (tagsRes.ok) {
      const tagsBody = await tagsRes.json().catch(() => ({}));
      const ollamaModel = (model && !['atom-free-dom', 'pollinations-free'].includes(model))
        ? model
        : tagsBody?.models?.[0]?.name;
      if (ollamaModel) {
        const chatRes = await fetchImpl('http://127.0.0.1:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            stream: false,
            messages: [
              { role: 'system', content: redactSensitiveText(systemPrompt) },
              { role: 'user', content: redactSensitiveText(userPrompt) }
            ]
          }),
          signal: AbortSignal.timeout(25000)
        });
        const chatBody = await chatRes.json().catch(() => ({}));
        const text = chatBody?.message?.content;
        if (chatRes.ok && text) {
          return { text: String(text), usedModel: `ollama/${ollamaModel}` };
        }
      }
    }
  } catch (_) {
    // Local Ollama not running; continue cleanly
  }

  // 2. Try free unauthenticated Pollinations OpenAI-compatible text endpoint (bounded to 6s total)
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetchImpl('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        seed: 42,
        messages: [
          { role: 'system', content: redactSensitiveText(systemPrompt) },
          { role: 'user', content: redactSensitiveText(userPrompt) }
        ]
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`free_ai_http_${res.status}`);
    }
    const rawText = await res.text();
    try {
      const parsed = JSON.parse(rawText);
      const content = parsed?.choices?.[0]?.message?.content;
      if (content) return { text: String(content), usedModel: 'pollinations/openai-free' };
    } catch (_) {
      if (rawText && rawText.trim().length > 20) {
        return { text: rawText.trim(), usedModel: 'pollinations/free' };
      }
    }
    throw new Error('free_ai_empty_response');
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function isGeneratedCodeGrounded(code, { inspectedDom, testType } = {}) {
  const src = String(code || '');
  if (src.trim().length < 30) return false;
  if (/\b(child_process|execSync|spawn|fork|eval|Function\s*\(|process\.env|fs\.)\b/.test(src)) return false;
  if (testType !== 'mobile' && !/\btest\s*\(/.test(src)) return false;
  if (inspectedDom?.url) {
    try {
      const host = new URL(inspectedDom.finalUrl || inspectedDom.url).hostname.toLowerCase();
      if (host && !src.toLowerCase().includes(host)) return false;
    } catch (_) {
      // ignore invalid URL
    }
    const domElements = [...(inspectedDom.inputs || []), ...(inspectedDom.buttons || [])];
    if (domElements.length > 0 && testType !== 'api' && testType !== 'mobile') {
      const tokens = domElements
        .flatMap(el => [el.selector, el.id, el.name, el.dataTestId, el.placeholder, el.text])
        .map(v => String(v || '').trim())
        .filter(v => v.length >= 2);
      const usesInspectedElement = tokens.some(tok => src.includes(tok));
      if (!usesInspectedElement) return false;
    }
  }
  return true;
}

async function callOpenAI({ apiKey, model, systemPrompt, userPrompt, fetchImpl = fetch }) {
  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: redactSensitiveText(systemPrompt) },
        { role: 'user', content: redactSensitiveText(userPrompt) }
      ],
      temperature: 0.25,
      max_tokens: 3000
    }),
    signal: AbortSignal.timeout(30000)
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message || `openai_http_${res.status}`);
  }
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error('openai_empty_response');
  return String(text);
}

async function callAnthropic({ apiKey, model, systemPrompt, userPrompt, fetchImpl = fetch }) {
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 3000,
      temperature: 0.25,
      system: redactSensitiveText(systemPrompt),
      messages: [{ role: 'user', content: redactSensitiveText(userPrompt) }]
    }),
    signal: AbortSignal.timeout(30000)
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message || `anthropic_http_${res.status}`);
  }
  const blocks = Array.isArray(body?.content) ? body.content : [];
  const text = blocks.filter(b => b?.type === 'text').map(b => b.text).join('\n').trim();
  if (!text) throw new Error('anthropic_empty_response');
  return text;
}

async function callGoogleGemini({ apiKey, model, systemPrompt, userPrompt, fetchImpl = fetch }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: redactSensitiveText(systemPrompt) }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: redactSensitiveText(userPrompt) }]
        }
      ],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 3000
      }
    }),
    signal: AbortSignal.timeout(30000)
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message || `google_http_${res.status}`);
  }
  const parts = body?.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => p?.text || '').join('\n').trim();
  if (!text) throw new Error('google_empty_response');
  return text;
}

async function generateWithUserProvider({
  llm = {},
  aiGenerator,
  prompt,
  testType,
  options = {},
  inspectedDom = null,
  targetUrl = '',
  fetchImpl = fetch,
  allowFreeRemote = true
}) {
  const resolved = resolveProviderConfig(llm);
  const domContext = formatInspectedDomContext(inspectedDom);
  const systemPrompt = aiGenerator.getSystemPrompt(testType);
  const userPrompt = `${aiGenerator.getUserPrompt(prompt, testType, options)}${domContext}`;

  let rawOutput = '';
  let effectiveProvider = resolved.provider;
  let effectiveModel = resolved.model;

  if (resolved.apiKey && ['openai', 'anthropic', 'google'].includes(resolved.provider)) {
    if (resolved.provider === 'openai') {
      rawOutput = await callOpenAI({
        apiKey: resolved.apiKey,
        model: resolved.model,
        systemPrompt,
        userPrompt,
        fetchImpl
      });
    } else if (resolved.provider === 'anthropic') {
      rawOutput = await callAnthropic({
        apiKey: resolved.apiKey,
        model: resolved.model,
        systemPrompt,
        userPrompt,
        fetchImpl
      });
    } else if (resolved.provider === 'google') {
      rawOutput = await callGoogleGemini({
        apiKey: resolved.apiKey,
        model: resolved.model,
        systemPrompt,
        userPrompt,
        fetchImpl
      });
    }
  } else {
    effectiveProvider = 'free';
    const isTestEnv = process.env.NODE_ENV === 'test'
      || Boolean(process.env.NODE_TEST_CONTEXT)
      || process.env.ATOM_OFFLINE_GENERATION === 'true';
    const canCallRemoteFree = allowFreeRemote && (!isTestEnv || fetchImpl !== fetch);
    if (canCallRemoteFree) {
      try {
        const freeRes = await callFreeAiModel({
          systemPrompt,
          userPrompt,
          model: resolved.model,
          fetchImpl
        });
        const cleanedCandidate = aiGenerator.cleanCode(freeRes.text, testType);
        if (isGeneratedCodeGrounded(cleanedCandidate, { inspectedDom, testType })) {
          rawOutput = cleanedCandidate;
          effectiveModel = freeRes.usedModel;
        }
      } catch (_) {
        // Fall through cleanly to DOM-grounded synthesizer
      }
    }

    if (!rawOutput && (inspectedDom || targetUrl)) {
      const synthesized = synthesizeTestFromDom({
        prompt,
        testType,
        targetUrl,
        inspectedDom,
        options
      });
      const mcpConfig = aiGenerator.generateMCPConfig(prompt, testType, options);
      return {
        id: crypto.randomUUID(),
        prompt,
        testType,
        code: synthesized.code,
        mcpConfig,
        summary: synthesized.summary,
        options,
        metadata: {
          generated: new Date().toISOString(),
          generator: 'ATOM Free AI · Live DOM Inspector',
          provider: 'free',
          model: 'dom-inspector',
          inspectedUrl: inspectedDom?.finalUrl || inspectedDom?.url || targetUrl || null,
          inspectedInputs: inspectedDom?.inputs?.length || 0,
          inspectedButtons: inspectedDom?.buttons?.length || 0,
          version: '1.0.0',
          ...(testType === 'mobile' ? { executionSupport: 'requires_configured_appium_worker' } : {})
        }
      };
    }

    if (!rawOutput) {
      return null;
    }
  }

  const code = aiGenerator.cleanCode(rawOutput, testType);
  const summary = `Generated ${testType.toUpperCase()} test using ${effectiveProvider} (${effectiveModel}) for: ${redactSensitiveText(prompt).slice(0, 140)}`;
  const mcpConfig = aiGenerator.generateMCPConfig(prompt, testType, options);

  return {
    id: crypto.randomUUID(),
    prompt,
    testType,
    code,
    mcpConfig,
    summary,
    options,
    metadata: {
      generated: new Date().toISOString(),
      generator: `ATOM AI · ${effectiveProvider}`,
      provider: effectiveProvider,
      model: effectiveModel,
      ...(inspectedDom?.url ? { inspectedUrl: inspectedDom.finalUrl || inspectedDom.url } : {}),
      version: '1.0.0',
      ...(testType === 'mobile' ? { executionSupport: 'requires_configured_appium_worker' } : {})
    }
  };
}

module.exports = {
  LLM_PROVIDERS,
  detectProviderFromKey,
  resolveProviderConfig,
  generateWithUserProvider
};
