const OpenAI = require('openai');

class AIGateway {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    this.client = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;
    this.allowlist = new Set(config.ai.allowedModels);
    this.usage = new Map();
  }

  redact(value) {
    return String(value || '').replace(/(authorization|api[-_]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
  }

  async chatCompletion({ model, messages, temperature = 0.2, maxTokens = 1000, tenantId, correlationId }) {
    const selectedModel = model || this.config.ai.defaultModel;
    if (!this.allowlist.has(selectedModel)) throw new Error('ai_model_not_allowed');
    const input = messages.reduce((sum, message) => sum + String(message.content || '').length, 0);
    if (input > this.config.ai.maxInputChars || maxTokens > this.config.ai.maxOutputTokens) throw new Error('ai_budget_exceeded');
    const key = `${tenantId || 'unknown'}:${new Date().toISOString().slice(0, 10)}`;
    const used = this.usage.get(key) || 0;
    if (used + input + maxTokens > this.config.ai.dailyTokenBudget) throw new Error('ai_daily_budget_exceeded');
    this.usage.set(key, used + input + maxTokens);
    if (!this.client) throw new Error('ai_provider_not_configured');
    this.logger.info('ai.gateway.request', { tenantId, correlationId, model: selectedModel, inputChars: input, maxTokens });
    const response = await this.client.chat.completions.create({ model: selectedModel, messages: messages.map(message => ({ ...message, content: this.redact(message.content) })), temperature, max_tokens: maxTokens, timeout: this.config.ai.timeoutMs });
    this.logger.info('ai.gateway.response', { tenantId, correlationId, model: selectedModel, usage: response.usage || null });
    return response;
  }
}

module.exports = AIGateway;
