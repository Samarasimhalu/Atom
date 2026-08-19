class PolicyEngine {
  constructor(config) { this.config = config; }

  evaluate(spec, context = {}) {
    const reasons = [];
    const tags = new Set(spec.tags || []);
    const target = spec.target?.url || '';
    if (spec.timeoutMs > this.config.policy.maxTimeoutMs) reasons.push('timeout_exceeds_policy');
    if (this.config.policy.blockedDomains.some(domain => target.includes(domain))) reasons.push('target_domain_blocked');
    if (spec.code && /\b(child_process|execSync|spawn|fork|eval|Function\s*\(|process\.env|fs\.)\b/.test(spec.code)) reasons.push('unsafe_code_pattern');
    const approvalRequired = this.config.policy.requireApprovalForTags.some(tag => tags.has(tag)) || spec.target?.environment === 'production';
    return { allowed: reasons.length === 0, approvalRequired, reasons, policyVersion: '2026-08-20' };
  }
}

module.exports = PolicyEngine;
