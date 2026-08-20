import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MAX_MESSAGE_BYTES = 64 * 1024;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const RUN_EVENT_STATES = Object.freeze({
  'run.queued': 'queued',
  'run.assigned': 'assigned',
  'run.started': 'running',
  'run.collecting_artifacts': 'collecting_artifacts',
  'run.passed': 'passed',
  'run.failed': 'failed',
  'run.cancelled': 'cancelled'
});
const TERMINAL_EVENTS = new Set(['run.passed', 'run.failed', 'run.cancelled']);

function isRunId(value) {
  return typeof value === 'string' && RUN_ID_PATTERN.test(value);
}

function useLatest(value) {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; }, [value]);
  return ref;
}

function reconnectDelay(attempt, initialDelayMs, maxDelayMs, jitterMs) {
  const exponential = Math.min(maxDelayMs, initialDelayMs * (2 ** Math.max(0, attempt)));
  return exponential + Math.floor(Math.random() * Math.max(0, jitterMs));
}

function safeParseEvent(raw, expectedTenantId) {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return null;
  let message;
  try { message = JSON.parse(raw); } catch { return null; }
  if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') return null;
  if (message.tenantId && String(message.tenantId) !== String(expectedTenantId)) return null;

  if (message.type === 'connection-established') return { type: message.type };
  if (message.type === 'subscribe-run-confirmed' && isRunId(message.runId)) return { type: message.type, runId: message.runId };
  if (message.type === 'unsubscribe-run-confirmed' && isRunId(message.runId)) return { type: message.type, runId: message.runId };
  if (message.type === 'dashboard.run-state-changed' && isRunId(message.runId) && Number.isInteger(message.sequence) && message.sequence >= 0 && typeof message.state === 'string') {
    return { type: message.type, runId: message.runId, state: message.state, sequence: message.sequence, occurredAt: message.occurredAt || message.timestamp };
  }
  if (Object.prototype.hasOwnProperty.call(RUN_EVENT_STATES, message.type) && isRunId(message.runId) && Number.isInteger(message.sequence) && message.sequence >= 0) {
    return { type: message.type, runId: message.runId, state: RUN_EVENT_STATES[message.type], sequence: message.sequence, occurredAt: message.timestamp };
  }
  if (message.type === 'error' && typeof message.message === 'string' && message.message.length <= 80) return { type: 'error', message: message.message };
  return null;
}

async function requestTicket({ ticketUrl, headers, signal }) {
  const response = await fetch(ticketUrl, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', ...headers },
    signal
  });
  if (!response.ok) throw new Error(`ticket_request_failed_${response.status}`);
  const payload = await response.json();
  if (!payload || typeof payload.ticket !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(payload.ticket)) throw new Error('ticket_response_invalid');
  return payload.ticket;
}

/**
 * Secure real-time Atom run stream.
 * WebSocket payloads are treated only as invalidation/progress data; dashboard
 * and run details still come from tenant-authorized REST resources.
 */
export function useAtomRunStream({
  enabled,
  wsUrl,
  tenantId,
  authMode = 'ticket',
  ticketUrl = '/api/realtime/websocket-ticket',
  ticketHeaders = {},
  focusedRunIds = [],
  onDashboardInvalidated,
  onRunTransition,
  replayRunEvents,
  loadRun,
  onError,
  initialDelayMs = 500,
  maxDelayMs = 30_000,
  jitterMs = 500,
  dashboardDebounceMs = 300
}) {
  const [status, setStatus] = useState(enabled ? 'connecting' : 'disabled');
  const [lastError, setLastError] = useState(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [lastEvent, setLastEvent] = useState(null);

  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const dashboardTimerRef = useRef(null);
  const abortRef = useRef(null);
  const stoppedRef = useRef(false);
  const attemptRef = useRef(0);
  const desiredRunIdsRef = useRef(new Set());
  const subscribedRunIdsRef = useRef(new Set());
  const seenSequencesRef = useRef(new Map());
  const replayingRef = useRef(new Set());
  const callbacksRef = useLatest({ onDashboardInvalidated, onRunTransition, replayRunEvents, loadRun, onError, tenantId, dashboardDebounceMs });
  const focusedKey = useMemo(() => [...new Set(focusedRunIds.filter(isRunId))].sort().join(','), [focusedRunIds]);

  const reportError = useCallback((error) => {
    const safeError = error instanceof Error ? error : new Error('realtime_error');
    setLastError(safeError);
    callbacksRef.current.onError?.(safeError);
  }, [callbacksRef]);

  const invalidateDashboard = useCallback((event) => {
    window.clearTimeout(dashboardTimerRef.current);
    dashboardTimerRef.current = window.setTimeout(() => callbacksRef.current.onDashboardInvalidated?.(event), callbacksRef.current.dashboardDebounceMs);
  }, [callbacksRef]);

  const send = useCallback((message) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const replayRun = useCallback(async (runId) => {
    const replay = callbacksRef.current.replayRunEvents;
    if (!replay || replayingRef.current.has(runId)) return;
    replayingRef.current.add(runId);
    try {
      const after = seenSequencesRef.current.get(runId) ?? 0;
      const events = await replay(runId, after);
      if (!Array.isArray(events)) throw new Error('run_event_replay_invalid');
      for (const storedEvent of events) {
        const payload = storedEvent?.payload && typeof storedEvent.payload === 'object' ? storedEvent.payload : storedEvent;
        const event = safeParseEvent(JSON.stringify({ ...payload, sequence: storedEvent?.sequence ?? payload?.sequence }), callbacksRef.current.tenantId);
        if (event && Object.prototype.hasOwnProperty.call(RUN_EVENT_STATES, event.type)) {
          const previous = seenSequencesRef.current.get(event.runId) ?? -1;
          if (event.sequence > previous) {
            seenSequencesRef.current.set(event.runId, event.sequence);
            callbacksRef.current.onRunTransition?.({ ...event, replayed: true });
          }
        }
      }
    } catch (error) {
      reportError(error);
    } finally {
      replayingRef.current.delete(runId);
    }
  }, [callbacksRef, reportError]);

  const handleEvent = useCallback((event) => {
    setLastEvent(event);
    if (event.type === 'connection-established') {
      invalidateDashboard(event);
      return;
    }
    if (event.type === 'dashboard.run-state-changed') {
      invalidateDashboard(event);
      return;
    }
    if (event.type === 'subscribe-run-confirmed') {
      subscribedRunIdsRef.current.add(event.runId);
      void replayRun(event.runId);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(RUN_EVENT_STATES, event.type)) {
      if (!desiredRunIdsRef.current.has(event.runId)) return;
      const previous = seenSequencesRef.current.get(event.runId) ?? -1;
      if (event.sequence <= previous) return;
      seenSequencesRef.current.set(event.runId, event.sequence);
      callbacksRef.current.onRunTransition?.(event);
      if (TERMINAL_EVENTS.has(event.type)) {
        invalidateDashboard(event);
        void callbacksRef.current.loadRun?.(event.runId).catch(reportError);
      }
      return;
    }
    if (event.type === 'error') reportError(new Error(`atom_websocket_${event.message}`));
  }, [callbacksRef, invalidateDashboard, replayRun, reportError]);

  useEffect(() => {
    desiredRunIdsRef.current = new Set(focusedKey ? focusedKey.split(',') : []);
    if (status !== 'connected') return;
    subscribedRunIdsRef.current.forEach(runId => {
      if (!desiredRunIdsRef.current.has(runId) && send({ type: 'unsubscribe-run', payload: { runId } })) subscribedRunIdsRef.current.delete(runId);
    });
    desiredRunIdsRef.current.forEach(runId => {
      if (!subscribedRunIdsRef.current.has(runId)) send({ type: 'subscribe-run', payload: { runId } });
    });
  }, [focusedKey, send, status]);

  useEffect(() => {
    if (!enabled || !wsUrl || !tenantId) {
      setStatus('disabled');
      return undefined;
    }

    stoppedRef.current = false;
    const clearReconnect = () => {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    };

    const connect = async () => {
      if (stoppedRef.current) return;
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setStatus(attemptRef.current ? 'reconnecting' : 'connecting');

      try {
        let protocols = ['atom-v1'];
        if (authMode === 'ticket') protocols = ['atom-v1', await requestTicket({ ticketUrl, headers: ticketHeaders, signal: abortRef.current.signal })];
        if (stoppedRef.current) return;
        const socket = new WebSocket(wsUrl, protocols);
        socketRef.current = socket;
        subscribedRunIdsRef.current.clear();

        socket.onopen = () => {
          if (socket !== socketRef.current) return;
          attemptRef.current = 0;
          setReconnectAttempt(0);
          setStatus('connected');
          setLastError(null);
          desiredRunIdsRef.current.forEach(runId => send({ type: 'subscribe-run', payload: { runId } }));
        };
        socket.onmessage = ({ data }) => {
          const event = safeParseEvent(String(data), callbacksRef.current.tenantId);
          if (event) handleEvent(event);
        };
        socket.onerror = () => reportError(new Error('atom_websocket_transport_error'));
        socket.onclose = (event) => {
          if (socket !== socketRef.current) return;
          socketRef.current = null;
          subscribedRunIdsRef.current.clear();
          if (stoppedRef.current || event.code === 1000) { setStatus('closed'); return; }
          if (event.code === 1008) reportError(new Error('atom_websocket_policy_denied'));
          const attempt = attemptRef.current++;
          setReconnectAttempt(attempt + 1);
          setStatus('reconnecting');
          const delay = reconnectDelay(attempt, initialDelayMs, maxDelayMs, jitterMs);
          reconnectTimerRef.current = window.setTimeout(() => { void connect(); }, delay);
        };
      } catch (error) {
        if (error?.name === 'AbortError' || stoppedRef.current) return;
        reportError(error);
        const attempt = attemptRef.current++;
        setReconnectAttempt(attempt + 1);
        setStatus('reconnecting');
        reconnectTimerRef.current = window.setTimeout(() => { void connect(); }, reconnectDelay(attempt, initialDelayMs, maxDelayMs, jitterMs));
      }
    };

    void connect();
    return () => {
      stoppedRef.current = true;
      clearReconnect();
      window.clearTimeout(dashboardTimerRef.current);
      abortRef.current?.abort();
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'dashboard_unmounted');
    };
  }, [authMode, callbacksRef, enabled, handleEvent, initialDelayMs, jitterMs, maxDelayMs, reportError, send, tenantId, ticketHeaders, ticketUrl, wsUrl]);

  const reconnectNow = useCallback(() => {
    attemptRef.current = 0;
    const socket = socketRef.current;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(4000, 'dashboard_reconnect_requested');
  }, []);

  return { status, connected: status === 'connected', reconnectAttempt, lastError, lastEvent, reconnectNow };
}
