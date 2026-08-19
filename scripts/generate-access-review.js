const fs = require('node:fs');
const crypto = require('node:crypto');

const inputPath = process.argv[2] || 'compliance/access-review-input.json';
const outputPath = process.argv[3] || `data/evidence/access-review-${new Date().toISOString().slice(0, 10)}.json`;
if (!fs.existsSync(inputPath)) {
  console.error(`access_review_input_missing:${inputPath}`);
  process.exit(1);
}
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const reviewedAt = new Date().toISOString();
const records = (input.records || []).map(record => ({
  userId: String(record.userId),
  tenantId: String(record.tenantId),
  roles: Array.isArray(record.roles) ? record.roles : [],
  privileged: Boolean(record.privileged),
  decision: ['approved', 'remove', 'modify', 'exception'].includes(record.decision) ? record.decision : 'exception',
  reviewer: input.reviewer,
  reviewedAt,
  ticket: record.ticket || null,
  exceptionExpiry: record.exceptionExpiry || null
}));
const report = { version: 1, controlId: 'CC6.2', period: input.period, reviewer: input.reviewer, reviewedAt, records, sha256: crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex') };
fs.mkdirSync(require('node:path').dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: 'created', outputPath, count: records.length, sha256: report.sha256 }));
