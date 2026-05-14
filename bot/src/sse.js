/**
 * SSE Listener Module
 * Connects to 985monitor.xyz /api/events-stream (Server-Sent Events)
 * Auto-reconnects on disconnect with configurable delay
 */

import EventSource from 'eventsource';

const EVENT_TYPES = ['twitter', 'square', 'truth', 'news', 'alpha'];

export function createSSEListener(config) {
  const {
    apiBase,
    reconnectDelay = 5000,
    onEvent,
    onStatus,
  } = config;

  let es = null;
  let state = 'disconnected'; // disconnected | connecting | open
  let reconnectTimer = null;
  let lastMessageAt = 0;

  function setState(newState) {
    state = newState;
    if (onStatus) onStatus({ state, lastMessageAt });
  }

  function connect() {
    if (es) {
      try { es.close(); } catch {}
    }
    clearTimeout(reconnectTimer);

    const url = `${apiBase}/api/events-stream`;
    setState('connecting');

    es = new EventSource(url);

    es.onopen = () => {
      setState('open');
      console.log('[SSE] Connected to', url);
    };

    // Listen to each event type from 985monitor
    for (const type of EVENT_TYPES) {
      es.addEventListener(type, (ev) => {
        lastMessageAt = Date.now();
        try {
          const payload = JSON.parse(ev.data);
          if (payload && payload.event) {
            onEvent(type, payload.event);
          }
        } catch (err) {
          console.error(`[SSE] Parse error for type=${type}:`, err.message);
        }
      });
    }

    // Ready event confirms connection is live
    es.addEventListener('ready', (ev) => {
      lastMessageAt = Date.now();
      setState('open');
      try {
        const payload = JSON.parse(ev.data);
        console.log('[SSE] Ready, server version:', payload?.clientVersion?.version || 'unknown');
      } catch {}
    });

    es.onerror = (err) => {
      const readyState = es ? es.readyState : 2;
      if (readyState === 2) {
        // CLOSED - need manual reconnect
        setState('disconnected');
        console.log(`[SSE] Disconnected, reconnecting in ${reconnectDelay}ms...`);
        scheduleReconnect();
      } else {
        // CONNECTING - EventSource auto-reconnects
        setState('connecting');
      }
    };
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      connect();
    }, reconnectDelay);
  }

  function disconnect() {
    clearTimeout(reconnectTimer);
    if (es) {
      try { es.close(); } catch {}
      es = null;
    }
    setState('disconnected');
  }

  function getState() {
    return { state, lastMessageAt };
  }

  return {
    connect,
    disconnect,
    getState,
  };
}
