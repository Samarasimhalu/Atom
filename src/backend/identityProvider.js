const crypto = require('node:crypto');

function decode(value) {
  return Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function parseJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('invalid_jwt');
  return { encodedHeader: parts[0], encodedPayload: parts[1], signature: decode(parts[2]), header: JSON.parse(decode(parts[0]).toString('utf8')), claims: JSON.parse(decode(parts[1]).toString('utf8')) };
}

function publicKeyFromJwk(jwk) {
  return crypto.createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' });
}

class OidcVerifier {
  constructor(config, fetchImpl = global.fetch) {
    this.config = config;
    this.fetch = fetchImpl;
    this.keys = new Map();
    this.expiresAt = 0;
  }

  async refreshKeys() {
    if (!this.config.auth.oidc.jwksUri) throw new Error('oidc_jwks_uri_missing');
    const response = await this.fetch(this.config.auth.oidc.jwksUri, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`oidc_jwks_http_${response.status}`);
    const body = await response.json();
    this.keys = new Map((body.keys || []).filter(key => key.kty === 'RSA' && key.kid).map(key => [key.kid, publicKeyFromJwk(key)]));
    this.expiresAt = Date.now() + 10 * 60 * 1000;
  }

  async verify(token) {
    const parsed = parseJwt(token);
    if (parsed.header.alg !== 'RS256' || !parsed.header.kid) throw new Error('oidc_algorithm_or_key_missing');
    if (Date.now() >= this.expiresAt) await this.refreshKeys();
    let key = this.keys.get(parsed.header.kid);
    if (!key) { await this.refreshKeys(); key = this.keys.get(parsed.header.kid); }
    if (!key) throw new Error('oidc_signing_key_not_found');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${parsed.encodedHeader}.${parsed.encodedPayload}`);
    verifier.end();
    if (!verifier.verify(key, parsed.signature)) throw new Error('oidc_signature_invalid');
    const now = Math.floor(Date.now() / 1000);
    const skew = 60;
    if (!parsed.claims.sub || !parsed.claims.tenant_id || !parsed.claims.exp || parsed.claims.exp < now - skew || (parsed.claims.nbf && parsed.claims.nbf > now + skew)) throw new Error('oidc_claims_invalid');
    if (parsed.claims.iss !== this.config.auth.oidc.issuer) throw new Error('oidc_issuer_invalid');
    const audience = Array.isArray(parsed.claims.aud) ? parsed.claims.aud : [parsed.claims.aud];
    if (!audience.includes(this.config.auth.oidc.audience)) throw new Error('oidc_audience_invalid');
    if (this.config.auth.oidc.requiredMfaClaim && parsed.claims[this.config.auth.oidc.requiredMfaClaim] !== true) throw new Error('oidc_mfa_required');
    return parsed.claims;
  }
}

function mapGroupsToRoles(claims, oidcConfig) {
  let mapping = {};
  try { mapping = JSON.parse(oidcConfig.roleMappingJson || '{}'); } catch (_) { throw new Error('oidc_role_mapping_invalid'); }
  const groups = Array.isArray(claims[oidcConfig.groupClaim || 'groups']) ? claims[oidcConfig.groupClaim || 'groups'] : [];
  const roles = [...new Set(groups.flatMap(group => mapping[group] ? [mapping[group]] : []))];
  return { ...claims, roles };
}

module.exports = { OidcVerifier, mapGroupsToRoles, parseJwt };
