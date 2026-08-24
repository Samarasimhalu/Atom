import type { Page } from '@playwright/test';

export type ElementCandidate = {
  selector: string;
  tag: string;
  role: string;
  name: string;
  text: string;
  id: string;
  testId: string;
  type: string;
  placeholder: string;
  title: string;
  parentText: string;
  labels: string;
};

export type AgentContext = {
  selector: string;
  action: 'click' | 'fill';
  candidates: ElementCandidate[];
};

export type AgentDecision = {
  selector: string;
  score: number;
  reasons: string[];
};

export interface HealingModel {
  decide(context: AgentContext): Promise<AgentDecision | undefined>;
}

type WordMap = Map<string, number>;

function words(value: string): string[] {
  return value.toLowerCase().replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
}

function wordMap(value: string): WordMap {
  const map: WordMap = new Map();
  for (const word of words(value)) map.set(word, (map.get(word) || 0) + 1);
  return map;
}

function cosineSimilarity(left: string, right: string): number {
  const leftMap = wordMap(left);
  const rightMap = wordMap(right);
  const keys = new Set([...leftMap.keys(), ...rightMap.keys()]);
  let dot = 0;
  let leftLength = 0;
  let rightLength = 0;
  for (const key of keys) {
    const leftValue = leftMap.get(key) || 0;
    const rightValue = rightMap.get(key) || 0;
    dot += leftValue * rightValue;
    leftLength += leftValue * leftValue;
    rightLength += rightValue * rightValue;
  }
  return leftLength && rightLength ? dot / Math.sqrt(leftLength * rightLength) : 0;
}

function selectorIntent(selector: string): string {
  return selector.replace(/[#.[\]="']/g, ' ').replace(/[-_]/g, ' ');
}

function hasContainedIntent(intent: string, description: string): boolean {
  const intentWords = words(intent);
  const descriptionWords = words(description);
  return intentWords.some((intentWord) => descriptionWords.some((descriptionWord) =>
    intentWord.length >= 4 && descriptionWord.length >= 4 &&
    (intentWord.includes(descriptionWord) || descriptionWord.includes(intentWord))));
}

export class LocalReasoningAgent implements HealingModel {
  async decide(context: AgentContext): Promise<AgentDecision | undefined> {
    const intent = selectorIntent(context.selector);
    const ranked = context.candidates.map((candidate) => {
      const description = [candidate.tag, candidate.role, candidate.name, candidate.text, candidate.id, candidate.testId, candidate.type, candidate.placeholder, candidate.title, candidate.labels, candidate.parentText].join(' ');
      let score = cosineSimilarity(intent, description) * 0.55;
      const reasons: string[] = [];
      if (score > 0) reasons.push('context words overlap');
      if (hasContainedIntent(intent, description)) {
        score += 0.65;
        reasons.push('compatible intent wording');
      }
      if (context.action === 'click' && /button|link|a/.test(candidate.role + ' ' + candidate.tag)) {
        score += 0.25;
        reasons.push('click-compatible element');
      }
      if (context.action === 'fill' && /input|textarea|select/.test(candidate.role + ' ' + candidate.tag)) {
        score += 0.25;
        reasons.push('fill-compatible element');
      }
      if (candidate.name || candidate.labels || candidate.placeholder) {
        score += 0.10;
        reasons.push('has user-facing context');
      }
      return { selector: candidate.selector, score: Math.min(score, 0.99), reasons };
    }).sort((left, right) => right.score - left.score);
    return ranked[0];
  }
}

export class OllamaReasoningAgent implements HealingModel {
  constructor(private readonly endpoint = 'http://127.0.0.1:11434/api/generate', private readonly model = 'qwen2.5:3b') {}

  async decide(context: AgentContext): Promise<AgentDecision | undefined> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(1500),
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: 'json',
        prompt: `You are a UI test healing agent. Choose exactly one candidate only if it represents the same user intent as the broken locator. Never choose a replacement for a different action. Return JSON: {"selector":"...","score":0.0,"reasons":["..."]}. Broken locator: ${context.selector}. Action: ${context.action}. Candidates: ${JSON.stringify(context.candidates)}`,
      }),
    });
    if (!response.ok) return undefined;
    const payload = await response.json() as { response?: string };
    if (!payload.response) return undefined;
    try {
      const decision = JSON.parse(payload.response) as AgentDecision;
      return typeof decision.selector === 'string' && typeof decision.score === 'number' ? decision : undefined;
    } catch {
      return undefined;
    }
  }
}

export class OpenAIReasoningAgent implements HealingModel {
  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY || '',
    private readonly model = process.env.AEGIS_OPENAI_MODEL || 'gpt-4o-mini',
    private readonly endpoint = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions',
  ) {}

  async decide(context: AgentContext): Promise<AgentDecision | undefined> {
    if (!this.apiKey) return undefined;
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(Number(process.env.AEGIS_AI_TIMEOUT_MS || 5000)),
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are a UI test healing agent. Choose exactly one candidate only if it represents the same user intent as the broken locator. Never choose a replacement for a different action. Return JSON with selector, score, and reasons.',
          },
          {
            role: 'user',
            content: JSON.stringify({ selector: context.selector, action: context.action, candidates: context.candidates }),
          },
        ],
      }),
    });
    if (!response.ok) return undefined;
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return undefined;
    try {
      const decision = JSON.parse(content) as AgentDecision;
      return typeof decision.selector === 'string' && typeof decision.score === 'number' && Array.isArray(decision.reasons)
        ? decision
        : undefined;
    } catch {
      return undefined;
    }
  }
}

export function createConfiguredReasoningAgent(): HealingModel {
  return process.env.OPENAI_API_KEY
    ? new OpenAIReasoningAgent()
    : new OllamaReasoningAgent();
}

export class HybridReasoningAgent implements HealingModel {
  constructor(
    private readonly ai = createConfiguredReasoningAgent(),
    private readonly fallback = new LocalReasoningAgent(),
  ) {}

  async decide(context: AgentContext): Promise<AgentDecision | undefined> {
    const fallbackDecision = await this.fallback.decide(context);
    try {
      const modelDecision = await this.ai.decide(context);
      if (modelDecision && fallbackDecision && modelDecision.selector === fallbackDecision.selector) {
        return {
          ...modelDecision,
          score: Math.max(modelDecision.score, fallbackDecision.score),
          reasons: [...new Set([...modelDecision.reasons, ...fallbackDecision.reasons, 'AI decision independently verified'])],
        };
      }
      if (modelDecision && !fallbackDecision) return modelDecision;
    } catch {
      // A local test run must remain usable when Ollama is not installed or running.
    }
    return fallbackDecision;
  }
}

export class AgenticHealingFlow {
  constructor(private readonly model: HealingModel = new LocalReasoningAgent()) {}

  async run(page: Page, context: AgentContext, threshold: number): Promise<AgentDecision> {
    const observed = context.candidates.filter((candidate) => candidate.selector);
    const decision = await this.model.decide({ ...context, candidates: observed });
    if (!decision || decision.score <= threshold || !observed.some((candidate) => candidate.selector === decision.selector)) {
      throw new Error(`Aegis agent could not safely heal locator ${context.selector}; best confidence was ${decision?.score.toFixed(3) || '0.000'}`);
    }
    const secondBest = observed
      .filter((candidate) => candidate.selector !== decision.selector)
      .map((candidate) => cosineSimilarity(selectorIntent(context.selector), [candidate.name, candidate.text, candidate.id, candidate.labels].join(' ')))
      .sort((left, right) => right - left)[0] || 0;
    if (decision.score - secondBest < 0.05) {
      throw new Error(`Aegis agent found an ambiguous healing candidate for locator ${context.selector}`);
    }
    return decision;
  }
}