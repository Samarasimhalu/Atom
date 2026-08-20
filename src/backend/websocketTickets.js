const crypto = require('crypto');

class WebSocketTicketStore {
  constructor({ ttlSeconds = 60, maxTickets = 10_000, now = () => Date.now() } = {}) {
    this.ttlMs = Math.max(30, Math.min(300, Number(ttlSeconds) || 60)) * 1000;
    this.maxTickets = Math.max(100, Number(maxTickets) || 10_000);
    this.now = now;
    this.tickets = new Map();
  }

  cleanup() {
    const now = this.now();
    this.tickets.forEach((record, ticket) => {
      if (record.expiresAt <= now) this.tickets.delete(ticket);
    });
    while (this.tickets.size > this.maxTickets) {
      const first = this.tickets.keys().next().value;
      if (!first) break;
      this.tickets.delete(first);
    }
  }

  issue({ tenantId, userId, roles = [], origin = null }) {
    this.cleanup();
    const ticket = crypto.randomBytes(32).toString('base64url');
    const expiresAt = this.now() + this.ttlMs;
    this.tickets.set(ticket, {
      tenantId: String(tenantId || ''),
      userId: String(userId || ''),
      roles: [...new Set(roles || [])],
      origin: origin || null,
      expiresAt
    });
    return { ticket, expiresAt: new Date(expiresAt).toISOString() };
  }

  consume(ticket, { origin = null } = {}) {
    const record = this.tickets.get(String(ticket || ''));
    // Delete before validation to make every ticket single-use, including a bad-origin attempt.
    if (record) this.tickets.delete(String(ticket));
    if (!record || record.expiresAt <= this.now()) return null;
    if (record.origin && record.origin !== origin) return null;
    if (!record.tenantId || !record.userId) return null;
    return {
      sub: record.userId,
      tenant_id: record.tenantId,
      roles: record.roles
    };
  }
}

module.exports = { WebSocketTicketStore };
