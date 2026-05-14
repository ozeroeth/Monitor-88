/**
 * Polling Fallback Module
 * Fetches latest events from REST endpoints when SSE is down or as backup dedup
 * Endpoints: twitter-live-events, binance-square-events, truth-social-events
 */

import fetch from 'node-fetch';

const ENDPOINTS = [
  { type: 'twitter', path: '/api/twitter-live-events?limit=20' },
  { type: 'square', path: '/api/binance-square-events?limit=20' },
  { type: 'truth', path: '/api/truth-social-events?limit=20' },
];

export function createPoller(config) {
  const {
    apiBase,
    intervalMs = 60000,
    onEvent,
    getSseState,
  } = config;

  let timer = null;
  let running = false;
  let lastPollAt = 0;
  let pollCount = 0;

  async function fetchEndpoint(endpoint) {
    const url = `${apiBase}${endpoint.path}`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Monitor88-TelegramBot/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.events)) return [];
      return data.events.map((ev) => ({ type: endpoint.type, event: ev }));
    } catch (err) {
      console.error(`[Poller] Fetch failed for ${endpoint.type}:`, err.message);
      return [];
    }
  }

  async function poll() {
    if (!running) return;
    pollCount++;
    lastPollAt = Date.now();

    // If SSE is open, poll less aggressively (just dedup safety net)
    const sseState = getSseState ? getSseState() : { state: 'disconnected' };
    const isBackup = sseState.state === 'open';

    if (isBackup && pollCount % 5 !== 0) {
      // When SSE is healthy, only do full poll every 5th cycle (5 minutes at 60s interval)
      return;
    }

    const results = await Promise.all(ENDPOINTS.map(fetchEndpoint));
    const allEvents = results.flat();

    for (const { type, event } of allEvents) {
      onEvent(type, event);
    }
  }

  function start() {
    if (running) return;
    running = true;
    console.log(`[Poller] Started, interval=${intervalMs}ms`);
    // First poll after short delay to let SSE connect first
    setTimeout(() => {
      poll();
      timer = setInterval(poll, intervalMs);
    }, 5000);
  }

  function stop() {
    running = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function getStats() {
    return { running, lastPollAt, pollCount };
  }

  return {
    start,
    stop,
    poll,
    getStats,
  };
}
