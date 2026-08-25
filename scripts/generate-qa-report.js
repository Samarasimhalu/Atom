const fs = require('node:fs');
const path = require('node:path');

const outputDirectory = process.env.QA_REPORT_DIR || 'qa-report';
const artifactDirectory = process.env.QA_ARTIFACT_DIR || 'qa-artifacts';
const jobs = [
  ['Backend core and security', process.env.QA_BACKEND_STATUS],
  ['Frontend lint and build', process.env.QA_FRONTEND_STATUS],
  ['Governance and release controls', process.env.QA_GOVERNANCE_STATUS],
  ['Aegis self-healing QA', process.env.QA_AEGIS_STATUS],
  ['Isolated worker images', process.env.QA_WORKERS_STATUS],
  ['Local infrastructure and readiness', process.env.QA_INFRASTRUCTURE_STATUS]
];

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function statusClass(status) {
  return status === 'success' ? 'pass' : status === 'skipped' ? 'skip' : 'fail';
}

function readFiles(directory, matcher) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return readFiles(entryPath, matcher);
    return matcher(entryPath) ? [entryPath] : [];
  });
}

const logFiles = readFiles(artifactDirectory, file => /\.(log|txt)$/i.test(file));
const aegisReports = readFiles(artifactDirectory, file => path.basename(file) === 'healing-report.json');
const reportSections = logFiles.map(file => `<details><summary>${escapeHtml(path.relative(artifactDirectory, file))}</summary><pre>${escapeHtml(fs.readFileSync(file, 'utf8'))}</pre></details>`).join('\n');
const aegisSections = aegisReports.map(file => `<details open><summary>Aegis healing report</summary><pre>${escapeHtml(fs.readFileSync(file, 'utf8'))}</pre></details>`).join('\n');
const passed = jobs.filter(([, status]) => status === 'success').length;
const failed = jobs.filter(([, status]) => status && !['success', 'skipped'].includes(status)).length;
const overall = failed ? 'FAIL' : 'PASS';

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ATOM QA Report</title>
<style>body{font:16px system-ui,sans-serif;max-width:1100px;margin:40px auto;padding:0 20px;color:#17202a;background:#f5f7fa}h1{margin-bottom:4px}.meta{color:#52606d}.summary{padding:18px;background:#fff;border:1px solid #d9e2ec;border-radius:8px;margin:24px 0}.overall{font-size:24px;font-weight:700;color:${overall === 'PASS' ? '#137333' : '#b3261e'}}.job{display:flex;justify-content:space-between;gap:20px;padding:12px 0;border-bottom:1px solid #e4e7eb}.job:last-child{border-bottom:0}.status{font-weight:700;text-transform:uppercase}.pass{color:#137333}.skip{color:#7b8794}.fail{color:#b3261e}details{background:#fff;border:1px solid #d9e2ec;border-radius:8px;margin:12px 0;padding:12px}pre{white-space:pre-wrap;overflow:auto;background:#17202a;color:#f5f7fa;padding:14px;border-radius:6px;max-height:420px}</style></head>
<body><h1>ATOM QA Report</h1><p class="meta">Generated ${escapeHtml(new Date().toISOString())} | Commit ${escapeHtml(process.env.GITHUB_SHA)} | Workflow <a href="${escapeHtml(process.env.GITHUB_SERVER_URL)}/${escapeHtml(process.env.GITHUB_REPOSITORY)}/actions/runs/${escapeHtml(process.env.GITHUB_RUN_ID)}">${escapeHtml(process.env.GITHUB_RUN_ID)}</a></p>
<section class="summary"><div class="overall">${overall}</div><p>${passed} job(s) passed, ${failed} job(s) failed. Skipped jobs are expected in pull-request mode.</p>${jobs.map(([name, status]) => `<div class="job"><span>${escapeHtml(name)}</span><span class="status ${statusClass(status)}">${escapeHtml(status || 'unknown')}</span></div>`).join('')}</section>
<h2>Captured results</h2>${aegisSections || '<p>No Aegis healing report was produced.</p>'}${reportSections || '<p>No job logs were uploaded.</p>'}</body></html>`);