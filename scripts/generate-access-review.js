#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const inputPath = process.argv[2] || 'compliance/access-review-input.json';
const outputPath = process.argv[3] || `data/evidence/access-review-${new Date().toISOString().slice(0, 10)}.json`;
if (!fs.existsSync(inputPath)) {
  console.error(`access_review_input_missing:${inputPath}`);
  process.exit(1);
}

const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (!input.period || !input.reviewer || !Array.isArray(input.records)) {
  console.error('access_review_period_reviewer_and_records_required');
  process.exit(1);
}

const reviewedAt = new Date().toISOString();
const seen = new Set();
const records = input.records.map((record, index) => {
  const userId = String(record.userId || '');
  const tenantId = String(record.tenantId || '');
  const decision = ['approved', 'remove', 'modify', 'exception'].includes(record.decision) ? record.decision : 'exception';
  if (!userId || !tenantId) throw new Error(`access_review_identity_required:${index}`);
  const key = `${tenantId}:${userId}`;
  if (seen.has(key)) throw new Error(`access_review_duplicate_identity:${key}`);
  seen.add(key);
  const exceptionExpiry = record.exceptionExpiry || null;
  if (decision === 'exception' && (!exceptionExpiry || Number.isNaN(Date.parse(exceptionExpiry)) || new Date(exceptionExpiry) <= new Date(reviewedAt))) {
    throw new Error(`access_review_exception_expiry_required:${key}`);
  }
  return {
    userId,
    tenantId,
    roles: Array.isArray(record.roles) ? [...new Set(record.roles.map(String))] : [],
    privileged: Boolean(record.privileged),
    decision,
    reviewer: String(input.reviewer),
    reviewedAt,
    ticket: record.ticket || null,
    exceptionExpiry
  };
});

const report = {
  version: 2,
  controlId: 'CC6.2',
  period: String(input.period),
  reviewer: String(input.reviewer),
  reviewedAt,
  records,
  sha256: crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex')
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ status: 'created', outputPath, count: records.length, sha256: report.sha256 }));
