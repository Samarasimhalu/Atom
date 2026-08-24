import { expect, test } from '@playwright/test';
import { OpenAIReasoningAgent, createConfiguredReasoningAgent, OllamaReasoningAgent, type AgentContext } from '../src/agent.js';

const context: AgentContext = {
  selector: '#username',
  action: 'fill',
  candidates: [{
    selector: '#name',
    tag: 'input',
    role: 'textbox',
    name: 'Name',
    text: '',
    id: 'name',
    testId: '',
    type: 'text',
    placeholder: '',
    title: '',
    parentText: 'Name',
    labels: 'Name',
  }],
};

test('uses OPENAI_API_KEY for structured healing decisions', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  const previousFetch = globalThis.fetch;
  let authorization = '';
  globalThis.fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get('authorization') || '';
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ selector: '#name', score: 0.98, reasons: ['same field intent'] }) } }] }), { status: 200 });
  };

  try {
    expect(createConfiguredReasoningAgent()).toBeInstanceOf(OpenAIReasoningAgent);
    await expect(new OpenAIReasoningAgent().decide(context)).resolves.toMatchObject({ selector: '#name', score: 0.98 });
    expect(authorization).toBe('Bearer test-key');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test('uses Ollama when OPENAI_API_KEY is absent', () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    expect(createConfiguredReasoningAgent()).toBeInstanceOf(OllamaReasoningAgent);
  } finally {
    if (previousKey !== undefined) process.env.OPENAI_API_KEY = previousKey;
  }
});