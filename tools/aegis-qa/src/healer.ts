import type { Locator, Page } from '@playwright/test';
import { AgenticHealingFlow, HybridReasoningAgent, type ElementCandidate, type HealingModel } from './agent.js';
import { PatchWriter } from './patch-writer.js';

export type HealingOptions = {
  threshold?: number;
  patchWriter?: PatchWriter;
  model?: HealingModel;
  onHeal?: (event: HealingEvent) => void;
};

export type HealingEvent = {
  original: string;
  healed: string;
  score: number;
  reasons: string[];
};

export class HealingPage {
  private readonly threshold: number;
  private readonly patchWriter: PatchWriter;
  private readonly flow: AgenticHealingFlow;
  private readonly onHeal?: (event: HealingEvent) => void;

  constructor(private readonly page: Page, options: HealingOptions = {}) {
    this.threshold = options.threshold ?? 0.95;
    this.patchWriter = options.patchWriter ?? new PatchWriter();
    this.flow = new AgenticHealingFlow(options.model ?? new HybridReasoningAgent());
    this.onHeal = options.onHeal;
  }

  locator(selector: string): HealingLocator {
    return new HealingLocator(this, selector);
  }

  async resolve(selector: string, action: 'click' | 'fill' = 'click'): Promise<Locator> {
    const original = this.page.locator(selector);
    if (await original.count()) return original.first();

    const candidates = await this.page.locator('button, a, input, textarea, select, [role], [id], [data-testid]').evaluateAll((elements) =>
      elements.map((element) => {
        const node = element as HTMLElement;
        const role = node.getAttribute('role') || node.tagName.toLowerCase();
        const name = node.getAttribute('aria-label') || node.textContent?.trim() || '';
        const id = node.id || '';
        const testId = node.getAttribute('data-testid') || '';
        const type = node.getAttribute('type') || '';
        const placeholder = node.getAttribute('placeholder') || '';
        const title = node.getAttribute('title') || '';
        const labels = Array.from((node as HTMLElement & { labels?: NodeListOf<HTMLLabelElement> }).labels || [])
          .map((label: HTMLLabelElement) => label.textContent?.trim() || '').join(' ');
        const parentText = node.parentElement?.textContent?.trim() || '';
        const selectorValue = id ? `#${id}` : testId ? `[data-testid="${testId}"]` : '';
        return { selector: selectorValue, tag: node.tagName.toLowerCase(), role, name, text: node.textContent?.trim() || '', id, testId, type, placeholder, title, labels, parentText };
      }),
    ) as ElementCandidate[];
    const decision = await this.flow.run(this.page, { selector, action, candidates }, this.threshold);
    const event = { original: selector, healed: decision.selector, score: decision.score, reasons: decision.reasons };
    this.patchWriter.record(event);
    this.onHeal?.(event);
    return this.page.locator(decision.selector).first();
  }
}

export class HealingLocator {
  constructor(private readonly owner: HealingPage, private readonly selector: string) {}

  async click(): Promise<void> {
    await (await this.owner.resolve(this.selector, 'click')).click();
  }

  async fill(value: string): Promise<void> {
    await (await this.owner.resolve(this.selector, 'fill')).fill(value);
  }
}