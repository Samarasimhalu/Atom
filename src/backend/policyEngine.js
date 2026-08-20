const net = require('node:net');

function matchesDomain(hostname, rule) {
  const normalizedRule = String(rule || '').trim().toLowerCase().replace(/^\./, '');
  if (!normalizedRule) return false;
  if (normalizedRule.startsWith('*.')) {
    const base = normalizedRule.slice(2);
    return hostname.endsWith(`.${base}`) && hostname !== base;
  }
  return hostname === normalizedRule || hostname.endsWith(`.${normalizedRule}`);
}

function isPrivateAddress(hostname) {
  const ipVersion = net.isIP(hostname);
  if (!ipVersion) return false;
  const value = hostname.toLowerCase();
  if (ipVersion === 6) return value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:');
  const [a, b] = value.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function parseTarget(target) {
  if (!target) return { url: null, hostname: null, error: null };
  try {
    const url = new URL(target);
    if (!['http:', 'https:'].includes(url.protocol)) return { url: null, hostname: null, error: 'target_protocol_not_allowed' };
    if (url.username || url.password) return { url: null, hostname: null, error: 'target_credentials_not_allowed' };
    return { url, hostname: url.hostname.toLowerCase().replace(/\.$/, ''), error: null };
  } catch (_) {
    return { url: null, hostname: null, error: 'target_url_invalid' };
  }
}

class PolicyEngine {
  constructor(config) { this.config = config; }

  evaluate(spec, context = {}) {
    const reasons = [];
    const tags = new Set(spec.tags || []);
    const target = parseTarget(spec.target?.url || '');
    if (spec.timeoutMs > this.config.policy.maxTimeoutMs) reasons.push('timeout_exceeds_policy');
    if (target.error) reasons.push(target.error);
    if (target.hostname) {
      if (isPrivateAddress(target.hostname)) reasons.push('target_private_address_blocked');
      if (this.config.policy.blockedDomains.some(domain => matchesDomain(target.hostname, domain))) reasons.push('target_domain_blocked');
      if (this.config.policy.allowedDomains.length && !this.config.policy.allowedDomains.some(domain => matchesDomain(target.hostname, domain))) reasons.push('target_domain_not_allowlisted');
    }
    if (spec.code && /\b(child_process|execSync|spawn|fork|eval|Function\s*\(|process\.env|fs\.)\b/.test(spec.code)) reasons.push('unsafe_code_pattern');
    const approvalRequired = this.config.policy.requireApprovalForTags.some(tag => tags.has(tag)) || spec.target?.environment === 'production';
    return { allowed: reasons.length === 0, approvalRequired, reasons, target: target.url ? { protocol: target.url.protocol, hostname: target.hostname, port: target.url.port || null } : null, policyVersion: '2026-08-20-p0' };
  }
}

module.exports = PolicyEngine;
module.exports.PolicyEngine = PolicyEngine;
module.exports.matchesDomain = matchesDomain;
module.exports.isPrivateAddress = isPrivateAddress;
module.exports.parseTarget = parseTarget;
