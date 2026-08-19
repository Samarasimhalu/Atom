const config = require('../src/backend/config');
const AITestGenerator = require('../src/backend/aiTestGenerator');
const PolicyEngine = require('../src/backend/policyEngine');
const EvaluationHarness = require('../src/backend/evaluationHarness');

(async () => {
  const generator = new AITestGenerator(config);
  const harness = new EvaluationHarness(config, generator, new PolicyEngine(config));
  const dataset = await harness.loadDataset(process.argv[2] || config.evaluation.datasetPath);
  const result = await harness.evaluate(dataset);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
