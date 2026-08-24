import { mkdir, writeFile } from 'node:fs/promises';
import type { HealingEvent } from './healer.js';

export class PatchWriter {
  private readonly events: HealingEvent[] = [];

  record(event: HealingEvent): void {
    if (!this.events.some((existing) => existing.original === event.original && existing.healed === event.healed)) {
      this.events.push(event);
    }
  }

  getEvents(): HealingEvent[] {
    return [...this.events];
  }

  async write(path = 'artifacts/aegis-healing.patch.json'): Promise<void> {
    await mkdir(path.substring(0, path.lastIndexOf('/')) || '.', { recursive: true });
    await writeFile(path, JSON.stringify({ generatedAt: new Date().toISOString(), patches: this.events }, null, 2));
  }
}