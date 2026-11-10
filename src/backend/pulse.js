/**
 * Atom Pulse: turns anonymized real-user journeys into ranked test-coverage gaps.
 * Pure code, no external services. Events are redacted on ingest and stored per tenant.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_EVENTS_PER_BATCH = 500;
const MAX_SESSIONS_PER_TENANT = 5000;
const SESSION_GAP_MS = 30 * 60 * 1000;
const EVENT_TYPES = new Set(['navigate', 'click', 'input', 'submit', 'error', 'api']);

const SENSITIVE_KEY = /(authorization|api[-_]?key|token|secret|password|passwd|email|phone|ssn|card|cvv|otp)/i;
const EMAIL = /[^\s@/]+@[^\s@/]+\.[^\s@/]+/g;
const LONG_DIGITS = /\b\d{9,}\b/g;

function redactText(value) {
  return String(value ?? '').replace(EMAIL, '[EMAIL]').replace(LONG_DIGITS, '[NUM]')
    .replace(/(authorization|api[-_]?key|token|secret|password)\s*[:=]\s*[^\s,;&]+/gi, '$1=[REDACTED]');
}

/** Collapse ids/uuids/numbers in a URL path so /orders/123 and /orders/456 form one route. */
function templatePath(rawUrl) {
  let pathname = String(rawUrl || '/');
  try { pathname = new URL(pathname, 'http://x').pathname; } catch { /* keep raw */ }
  const parts = pathname.split('/').map(seg => {
    if (!seg) return seg;
    if (/^\d+$/.test(seg)) return ':id';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ':id';
    if (/^[0-9a-f]{16,}$/i.test(seg)) return ':id';
    return redactText(seg);
  });
  return parts.join('/') || '/';
}

function sanitizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = String(raw.type || '');
  if (!EVENT_TYPES.has(type)) return null;
  const ts = Number.isFinite(Number(raw.ts)) ? Number(raw.ts) : Date.parse(raw.ts);
  if (!Number.isFinite(ts)) return null;
  const sessionId = String(raw.sessionId || '').slice(0, 100);
  if (!sessionId) return null;
  const event = { type, ts, sessionId, path: templatePath(raw.path || raw.url) };
  if (raw.target) {
    // Element identifiers only; never keep typed values.
    event.target = redactText(String(raw.target).slice(0, 120));
    if (SENSITIVE_KEY.test(event.target) && type === 'input') event.target = '[SENSITIVE_FIELD]';
  }
  if (type === 'error') event.message = redactText(raw.message).slice(0, 200);
  if (type === 'api') event.status = Number(raw.status) || 0;
  return event;
}

/** Collapse a session into an ordered, de-duplicated list of step signatures. */
function sessionSteps(events) {
  const steps = [];
  for (const e of [...events].sort((a, b) => a.ts - b.ts)) {
    if (e.type === 'input' || e.type === 'error') continue; // inputs are noisy; errors are scored, not part of the path
    const sig = e.type === 'navigate' ? `navigate ${e.path}`
      : e.type === 'api' ? `api ${e.path} ${e.status >= 400 ? 'fail' : 'ok'}`
      : `${e.type} ${e.target || ''}@${e.path}`.trim();
    if (steps[steps.length - 1] !== sig) steps.push(sig);
  }
  return steps;
}

/** Group sessions with identical step sequences into journeys and rank them by risk. */
function mineJourneys(sessions, { minSessions = 2, maxSteps = 12 } = {}) {
  const total = sessions.length || 1;
  const buckets = new Map();
  for (const events of sessions) {
    const steps = sessionSteps(events).slice(0, maxSteps);
    if (steps.length < 2) continue;
    const key = crypto.createHash('sha256').update(steps.join('|')).digest('hex').slice(0, 16);
    const bucket = buckets.get(key) || { id: key, steps, sessions: 0, errors: 0, paths: new Set() };
    bucket.sessions += 1;
    if (events.some(e => e.type === 'error' || (e.type === 'api' && e.status >= 400))) bucket.errors += 1;
    events.forEach(e => bucket.paths.add(e.path));
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .filter(b => b.sessions >= minSessions)
    .map(b => {
      const share = b.sessions / total;
      const errorRate = b.errors / b.sessions;
      const touchesMoney = [...b.paths].some(p => /checkout|pay|cart|billing|order|subscribe/i.test(p));
      const riskScore = Number((share * 100 * (1 + errorRate * 3) * (touchesMoney ? 1.5 : 1)).toFixed(2));
      return { id: b.id, steps: b.steps, sessions: b.sessions, trafficShare: Number((share * 100).toFixed(1)), errorRate: Number(errorRate.toFixed(2)), touchesMoney, riskScore, paths: [...b.paths] };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

/** A journey is covered when existing tests touch all of its routes. */
function computeCoverage(journeys, existingSpecs = []) {
  const covered = new Set();
  for (const spec of existingSpecs) {
    const text = JSON.stringify([spec.target?.url, spec.steps, spec.code, spec.purpose]);
    covered.add(text);
  }
  const texts = [...covered];
  const annotated = journeys.map(j => {
    const routes = j.paths.filter(p => p !== '/');
    const coveredRoutes = routes.filter(r => texts.some(t => t.includes(r.replace(':id', ''))));
    return { ...j, covered: routes.length > 0 && coveredRoutes.length === routes.length, coveredRoutes: coveredRoutes.length, totalRoutes: routes.length };
  });
  const totalTraffic = annotated.reduce((s, j) => s + j.sessions, 0) || 1;
  const coveredTraffic = annotated.filter(j => j.covered).reduce((s, j) => s + j.sessions, 0);
  return { journeys: annotated, realUserCoveragePercent: Number(((coveredTraffic / totalTraffic) * 100).toFixed(1)) };
}

function journeyToPrompt(journey) {
  const lines = journey.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return `Create a regression test for a real user journey seen in production (${journey.trafficShare}% of sessions, error rate ${journey.errorRate}).\nSteps:\n${lines}\nAssert that each step completes without errors.`;
}

class PulseService {
  constructor({ maxSessions = MAX_SESSIONS_PER_TENANT, filePath = null } = {}) {
    this.maxSessions = maxSessions;
    this.filePath = filePath;
    this.tenants = new Map(); // tenantId -> Map(sessionId -> events[])
    this.saveTimer = null;
    this.load();
  }

  load() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      for (const [tenantId, sessions] of Object.entries(raw)) this.tenants.set(tenantId, new Map(Object.entries(sessions)));
    } catch { /* corrupt snapshot: start empty rather than crash */ }
  }

  save() {
    if (!this.filePath) return;
    const out = {};
    for (const [tenantId, sessions] of this.tenants) out[tenantId] = Object.fromEntries(sessions);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath + '.tmp', JSON.stringify(out));
    fs.renameSync(this.filePath + '.tmp', this.filePath);
  }

  scheduleSave() {
    if (!this.filePath || this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; try { this.save(); } catch { /* best effort */ } }, 2000);
    this.saveTimer.unref?.();
  }

  ingest(tenantId, rawEvents) {
    if (!Array.isArray(rawEvents)) throw new Error('events_must_be_array');
    if (rawEvents.length > MAX_EVENTS_PER_BATCH) throw new Error('batch_too_large');
    const sessions = this.tenants.get(tenantId) || new Map();
    let accepted = 0;
    for (const raw of rawEvents) {
      const event = sanitizeEvent(raw);
      if (!event) continue;
      const list = sessions.get(event.sessionId) || [];
      list.push(event);
      sessions.set(event.sessionId, list);
      accepted += 1;
    }
    while (sessions.size > this.maxSessions) sessions.delete(sessions.keys().next().value);
    this.tenants.set(tenantId, sessions);
    this.scheduleSave();
    return { accepted, rejected: rawEvents.length - accepted };
  }

  sessionList(tenantId) {
    return [...(this.tenants.get(tenantId) || new Map()).values()];
  }

  journeys(tenantId, options) {
    return mineJourneys(this.sessionList(tenantId), options);
  }

  coverage(tenantId, existingSpecs, options) {
    return computeCoverage(this.journeys(tenantId, options), existingSpecs);
  }

  gaps(tenantId, existingSpecs, options = {}) {
    const { journeys, realUserCoveragePercent } = this.coverage(tenantId, existingSpecs, options);
    const gaps = journeys.filter(j => !j.covered).slice(0, options.limit || 10)
      .map(j => ({ ...j, suggestedPrompt: journeyToPrompt(j) }));
    return { realUserCoveragePercent, gaps };
  }

  /** Plain-language answer used by the voice/chat copilot. */
  summarize(tenantId, existingSpecs) {
    const { realUserCoveragePercent, gaps } = this.gaps(tenantId, existingSpecs, { limit: 3 });
    if (!this.sessionList(tenantId).length) return { text: 'No user sessions have been captured yet.', realUserCoveragePercent: 0, gaps: [] };
    const top = gaps[0];
    const text = top
      ? `Real-user coverage is ${realUserCoveragePercent} percent. The riskiest untested journey covers ${top.trafficShare} percent of sessions across ${top.paths.join(', ')}.`
      : `Real-user coverage is ${realUserCoveragePercent} percent. Every mined journey has tests.`;
    return { text, realUserCoveragePercent, gaps };
  }
}

/** Ingest-only API keys: let the browser SDK send events without a user session or any read access. */
class PulseKeyStore {
  constructor({ filePath = null } = {}) {
    this.filePath = filePath;
    this.byHash = new Map(); // sha256(key) -> { id, tenantId, label, createdAt, createdBy }
    if (filePath && fs.existsSync(filePath)) {
      try { for (const rec of JSON.parse(fs.readFileSync(filePath, 'utf8'))) this.byHash.set(rec.hash, rec); } catch { /* start empty */ }
    }
  }

  static hash(key) { return crypto.createHash('sha256').update(String(key)).digest('hex'); }

  persist() {
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath + '.tmp', JSON.stringify([...this.byHash.values()]));
    fs.renameSync(this.filePath + '.tmp', this.filePath);
  }

  /** The raw key is returned once and never stored. */
  create(tenantId, { label = '', createdBy = '' } = {}) {
    const key = `apk_${crypto.randomBytes(24).toString('base64url')}`;
    const rec = { id: crypto.randomUUID(), hash: PulseKeyStore.hash(key), tenantId, label: String(label).slice(0, 80), createdBy, createdAt: new Date().toISOString() };
    this.byHash.set(rec.hash, rec);
    this.persist();
    return { id: rec.id, key, tenantId, label: rec.label, createdAt: rec.createdAt };
  }

  /** Returns the key record (including tenantId) or null. */
  verify(key) {
    if (typeof key !== 'string' || !key.startsWith('apk_') || key.length > 100) return null;
    return this.byHash.get(PulseKeyStore.hash(key)) || null;
  }

  list(tenantId) {
    return [...this.byHash.values()].filter(r => r.tenantId === tenantId)
      .map(({ id, label, createdAt, createdBy }) => ({ id, label, createdAt, createdBy }));
  }

  revoke(tenantId, id) {
    for (const [hash, rec] of this.byHash) {
      if (rec.id === id && rec.tenantId === tenantId) { this.byHash.delete(hash); this.persist(); return true; }
    }
    return false;
  }
}

module.exports = { PulseService, PulseKeyStore, sanitizeEvent, templatePath, redactText, mineJourneys, computeCoverage, journeyToPrompt, sessionSteps, SESSION_GAP_MS };
