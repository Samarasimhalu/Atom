class StreamingService {
  constructor(wss) {
    this.wss = wss;
    this.connections = new Map();
    this.subscriptions = new Map();
  }

  addConnection(ws, connectionId, identity = {}) {
    this.connections.set(connectionId, {
      ws,
      tenantId: String(identity.tenantId || ''),
      userId: String(identity.userId || ''),
      roles: [...new Set(identity.roles || [])],
      subscriptions: new Set(),
      connected: true,
      connectedAt: new Date().toISOString()
    });
    ws.on('close', () => this.removeConnection(connectionId));
    ws.on('error', () => this.removeConnection(connectionId));
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

  allowedChannel(connection, channel) {
    return channel === `tenant-${connection.tenantId}`;
  }

  subscribe(connectionId, channel) {
    const connection = this.connections.get(connectionId);
    if (!connection || !this.allowedChannel(connection, channel)) return false;
    if (!this.subscriptions.has(channel)) this.subscriptions.set(channel, new Set());
    this.subscriptions.get(channel).add(connectionId);
    connection.subscriptions.add(channel);
    return true;
  }

  unsubscribe(connectionId, channel) {
    const connection = this.connections.get(connectionId);
    if (!connection || !this.allowedChannel(connection, channel)) return false;
    const subscribers = this.subscriptions.get(channel);
    if (subscribers) {
      subscribers.delete(connectionId);
      if (subscribers.size === 0) this.subscriptions.delete(channel);
    }
    connection.subscriptions.delete(channel);
    return true;
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

  handleMessage(ws, data) {
    try {
      const connectionId = ws.connectionId;
      const { type, payload = {} } = data || {};
      if (!connectionId) throw new Error('connection_not_registered');
      if (type === 'subscribe' || type === 'unsubscribe') {
        const channel = String(payload.channel || '');
        const success = type === 'subscribe' ? this.subscribe(connectionId, channel) : this.unsubscribe(connectionId, channel);
        if (!success) return this.sendToConnection(connectionId, { type: 'error', message: 'subscription_not_authorized' });
        return this.sendToConnection(connectionId, { type: `${type}-confirmed`, channel });
      }
      if (type === 'ping') return this.sendToConnection(connectionId, { type: 'pong' });
      return this.sendToConnection(connectionId, { type: 'error', message: 'unsupported_message_type' });
    } catch (_) {
      ws.send(JSON.stringify({ type: 'error', message: 'invalid_message_format' }));
    }
  }

  getStatus() {
    return { totalConnections: this.connections.size, activeChannels: this.subscriptions.size };
  }

  sendTestUpdate(sessionId, update) { return this.broadcast({ type: 'test-update', sessionId, ...update }); }
  sendSystemNotification(message, level = 'info') { return this.broadcast({ type: 'system-notification', level, message }); }
  sendAnalyticsUpdate(data) { return this.broadcast({ type: 'analytics-update', data }); }
  cleanup() {}
  startCleanup() {}
}

module.exports = StreamingService;
