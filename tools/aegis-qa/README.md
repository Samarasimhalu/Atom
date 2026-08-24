# Aegis-QA

Local, confidence-gated self-healing for Playwright tests.

## Quick start

```sh
npm install
npx playwright install chromium
npm test
```

## Usage

Wrap a Playwright `Page` and use the SDK for actions that may need healing:

```ts
const aegis = new HealingPage(page, { threshold: 0.95 });
await aegis.locator('#login').click();
```

The original locator is always used first. Healing runs only after it fails, and a candidate is accepted only when its confidence is strictly greater than `95%` and clearly ahead of the next candidate. Every accepted repair is exposed through `PatchWriter` and written as JSON for review.

The healing flow is agentic: it observes the failed locator and DOM context, asks OpenAI when `OPENAI_API_KEY` is configured, or uses a local Ollama model when it is not. It verifies the action and confidence, performs the action, and records the repair. If the selected provider is unavailable, it falls back to explainable local reasoning. It intentionally fails when the replacement has a different purpose, such as `Search` becoming `Filter`.

Atom and Aegis use the same `OPENAI_API_KEY` environment variable. Aegis uses
`gpt-4o-mini` by default; set `AEGIS_OPENAI_MODEL` to choose another approved
OpenAI-compatible model. For an OpenAI-compatible endpoint, set
`OPENAI_BASE_URL` as well. The key is sent only in the provider request and is
never included in healing events or patch files.

To enable the local model, install Ollama and pull a small model:

```sh
ollama run qwen2.5:3b
```

The SDK calls `http://127.0.0.1:11434` and sends only the failed locator, requested action, and structured DOM candidate context.
