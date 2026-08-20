const { hasPermission } = require('./security');

class StreamingService {
  constructor(wss, { resolveRun = async () => null, maxMessagesPerMinute = 60, maxRunSubscriptions = 25, now = () => Date.now() } = {}) {
    this.wss = wss;
    this.resolveRun = resolveRun;
    this.maxMessagesPerMinute = maxMessagesPerMinute;
    this.maxRunSubscriptions = maxRunSubscriptions;
    this.now = now;
    this.connections = new Map();
    this.subscriptions = new Map();
  }

  addConnection(ws, connectionId, identity = {}) {
    const connection = {
      ws,
      tenantId: String(identity.tenantId || ''),
      userId: String(identity.userId || ''),
      roles: [...new Set(identity.roles || [])],
      subscriptions: new Set(),
      runChannels: new Set(),
      messageWindowStartedAt: this.now(),
      messageCount: 0,
      connected: true,
      connectedAt: new Date().toISOString()
    };
    this.connections.set(connectionId, connection);
    ws.on('close', () => this.removeConnection(connectionId));
    ws.on('error', () => this.removeConnection(connectionId));
    return connection;
  }

  removeConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    connection.connected = false;
    this.connections.delete(connectionId);
    this.subscriptions.forEach((subscribers, channel) => {
      subscribers.delete(connectionId);
      if (subscribers.size === 0) this.subscriptions.delete(channel);
    });
  }

  tenantChannel(tenantId) { return `tenant-${String(tenantId)}`; }
  runChannel(runId) { return `run-${String(runId)}`; }

  subscribeChannel(connectionId, channel) {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;
    if (!this.subscriptions.has(channel)) this.subscriptions.set(channel, new Set());
    this.subscriptions.get(channel).add(connectionId);
    connection.subscriptions.add(channel);
    return true;
  }

  unsubscribeChannel(connectionId, channel) {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;
    const subscribers = this.subscriptions.get(channel);
    if (subscribers) {
      subscribers.delete(connectionId);
      if (subscribers.size === 0) this.subscriptions.delete(channel);
    }
    connection.subscriptions.delete(channel);
    connection.runChannels.delete(channel);
    return true;
  }

  subscribeTenant(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection?.tenantId) return false;
    return this.subscribeChannel(connectionId, this.tenantChannel(connection.tenantId));
  }

  validRunId(runId) { return typeof runId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(runId); }

  async subscribeRun(connectionId, runId) {
    const connection = this.connections.get(connectionId);
    if (!connection || !this.validRunId(runId)) return { allowed: false, reason: 'subscription_not_authorized' };
    if (!hasPermission(connection.roles, 'runs:read')) return { allowed: false, reason: 'permission_denied' };
    const channel = this.runChannel(runId);
    if (connection.runChannels.has(channel)) return { allowed: true, channel, replayed: true };
    if (connection.runChannels.size >= this.maxRunSubscriptions) return { allowed: false, reason: 'subscription_limit_exceeded' };
    const run = await this.resolveRun(runId, connection.tenantId);
    if (!run) return { allowed: false, reason: 'subscription_not_authorized' };
    this.subscribeChannel(connectionId, channel);
    connection.runChannels.add(channel);
    return { allowed: true, channel };
  }

  unsubscribeRun(connectionId, runId) {
    const connection = this.connections.get(connectionId);
    if (!connection || !this.validRunId(runId)) return false;
    return this.unsubscribeChannel(connectionId, this.runChannel(runId));
  }

  allowMessage(connection) {
    const now = this.now();
    if (now - connection.messageWindowStartedAt >= 60_000) {
      connection.messageWindowStartedAt = now;
      connection.messageCount = 0;
    }
    connection.messageCount += 1;
    return connection.messageCount <= this.maxMessagesPerMinute;
  }

  broadcast(message) {
    const messageStr = JSON.stringify({ ...message, timestamp: message.timestamp || new Date().toISOString() });
    this.connections.forEach((connection, connectionId) => {
      if (connection.connected && connection.ws.readyState === 1) {
        try { connection.ws.send(messageStr); } catch (_) { this.removeConnection(connectionId); }
      }
    });
  }

  sendToChannel(channel, message) {
    const subscribers = this.subscriptions.get(channel);
    if (!subscribers) return;
    const messageStr = JSON.stringify({ ...message, channel, timestamp: message.timestamp || new Date().toISOString() });
    subscribers.forEach(connectionId => {
      const connection = this.connections.get(connectionId);
      if (connection?.connected && connection.ws.readyState === 1) {
        try { connection.ws.send(messageStr); } catch (_) { this.removeConnection(connectionId); }
      }
    });
  }

  sendToConnection(connectionId, message) {
    const connection = this.connections.get(connectionId);
    if (connection?.connected && connection.ws.readyState === 1) {
      try { connection.ws.send(JSON.stringify({ ...message, timestamp: message.timestamp || new Date().toISOString() })); } catch (_) { this.removeConnection(connectionId); }
    }
  }

  async handleMessage(ws, data) {
    const connectionId = ws.connectionId;
    const connection = this.connections.get(connectionId);
    if (!connection) return this.sendToConnection(connectionId, { type: 'error', message: 'connection_not_registered' });
    if (!this.allowMessage(connection)) return this.sendToConnection(connectionId, { type: 'error', message: 'rate_limit_exceeded' });
    if (!data || typeof data !== 'object' || Array.isArray(data)) return this.sendToConnection(connectionId, { type: 'error', message: 'invalid_message_format' });
    const { type, payload = {} } = data;
    if (type === 'subscribe-run') {
      const result = await this.subscribeRun(connectionId, payload.runId);
      return this.sendToConnection(connectionId, result.allowed
        ? { type: 'subscribe-run-confirmed', runId: payload.runId, channel: result.channel, replayed: result.replayed || false }
        : { type: 'error', message: result.reason });
    }
    if (type === 'unsubscribe-run') {
      const success = this.unsubscribeRun(connectionId, payload.runId);
      return this.sendToConnection(connectionId, success
        ? { type: 'unsubscribe-run-confirmed', runId: payload.runId }
        : { type: 'error', message: 'subscription_not_authorized' });
    }
    if (type === 'ping') return this.sendToConnection(connectionId, { type: 'pong' });
    return this.sendToConnection(connectionId, { type: 'error', message: 'unsupported_message_type' });
  }

  getStatus() { return { totalConnections: this.connections.size, activeChannels: this.subscriptions.size }; }
  sendTestUpdate(sessionId, update) { return this.broadcast({ type: 'test-update', sessionId, ...update }); }
  sendSystemNotification(message, level = 'info') { return this.broadcast({ type: 'system-notification', level, message }); }
  sendAnalyticsUpdate(data) { return this.broadcast({ type: 'analytics-update', data }); }
  cleanup() {}
  startCleanup() {}
}

module.exports = StreamingService;
