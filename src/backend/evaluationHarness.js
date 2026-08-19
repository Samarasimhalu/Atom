const fs = require('fs-extra');
const { validateTestSpecification } = require('./testSpecification');

class EvaluationHarness {
  constructor(config, generator, policyEngine, logger = console) { this.config = config; this.generator = generator; this.policyEngine = policyEngine; this.logger = logger; }

  async loadDataset(datasetPath = this.config.evaluation.datasetPath) { return fs.readJson(datasetPath); }

  async evaluate(dataset) {
    const cases = [];
    for (const item of dataset) {
      const started = Date.now();
      try {
        const generated = await this.generator.generateTest(item.prompt, item.testType || 'ui', item.options || {});
        const schema = validateTestSpecification({ ...generated, name: item.name || `eval-${item.id}`, target: item.target, assertions: item.assertions || ['generated'] });
        const policy = this.policyEngine.evaluate(schema.spec);
        const assertionScore = item.mustContain ? item.mustContain.filter(token => generated.code.includes(token)).length / item.mustContain.length : 1;
        const score = schema.valid && policy.allowed ? assertionScore : 0;
        cases.push({ id: item.id, score, schemaValid: schema.valid, policyAllowed: policy.allowed, latencyMs: Date.now() - started, errors: [...schema.errors, ...policy.reasons] });
      } catch (error) { cases.push({ id: item.id, score: 0, schemaValid: false, policyAllowed: false, latencyMs: Date.now() - started, errors: [error.message] }); }
    }
    const score = cases.length ? cases.reduce((sum, item) => sum + item.score, 0) / cases.length : 0;
    return { score, passed: score >= this.config.evaluation.minimumScore, minimumScore: this.config.evaluation.minimumScore, cases, evaluatedAt: new Date().toISOString() };
  }
}

module.exports = EvaluationHarness;
