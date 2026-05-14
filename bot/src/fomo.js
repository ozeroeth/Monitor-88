/**
 * FOMO Data Cache Module
 * Fetches https://985monitor.xyz/fomo/ page, parses inline JSON from
 * <script id="tabs-data" type="application/json">, caches in memory.
 * Refreshes every hour. Provides search by handle/wallet.
 *
 * Tabs: 24h, 7d, 30d, all (profit leaderboards), social (KOL mutual follows)
 */

import fetch from 'node-fetch';

const FOMO_URL_PATH = '/fomo/';
const TABS_REGEX = /<script id="tabs-data" type="application\/json">([\s\S]*?)<\/script>/;

let cache = null; // { tabs: {}, updatedAt: 0 }
let refreshTimer = null;

export function createFomoCache(config) {
  const { apiBase, intervalMs = 3600000 } = config;

  async function refresh() {
    const url = `${apiBase}${FOMO_URL_PATH}`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Monitor88-TelegramBot/1.0' },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const match = html.match(TABS_REGEX);
      if (!match) throw new Error('tabs-data script tag not found');
      const tabs = JSON.parse(match[1]);
      cache = { tabs, updatedAt: Date.now() };
      console.log(`[FOMO] Cache refreshed. Tabs: ${Object.keys(tabs).join(', ')}`);
    } catch (err) {
      console.error('[FOMO] Refresh failed:', err.message);
    }
  }

  function start() {
    refresh();
    refreshTimer = setInterval(refresh, intervalMs);
    console.log(`[FOMO] Cache started, refresh every ${intervalMs / 1000}s`);
  }

  function stop() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  /** Get top N rows from a specific tab (24h, 7d, 30d, all, social) */
  function getLeaderboard(tab = '24h', limit = 10) {
    if (!cache) return null;
    const tabData = cache.tabs[tab];
    if (!tabData) return null;
    return {
      label: tabData.label,
      meta: tabData.meta,
      rows: tabData.rows.slice(0, limit),
      pnlField: tabData.pnlField,
    };
  }

  /** Search across all tabs by handle, name, wallet address, or fomo_id */
  function search(query) {
    if (!cache) return [];
    const q = query.toLowerCase().trim();
    const results = [];
    const seen = new Set();

    for (const [tabKey, tabData] of Object.entries(cache.tabs)) {
      for (const row of tabData.rows) {
        const id = row.fomo_id || row.handle;
        if (seen.has(id)) continue;

        const match =
          (row.handle || '').toLowerCase().includes(q) ||
          (row.name || '').toLowerCase().includes(q) ||
          (row.real_solana || '').toLowerCase() === q ||
          (row.real_evm || '').toLowerCase() === q ||
          (row.fomo_id || '').toLowerCase() === q ||
          (row.twitter || '').toLowerCase().includes(q);

        if (match) {
          seen.add(id);
          results.push({ ...row, _foundIn: tabKey });
        }
      }
    }
    return results.slice(0, 10);
  }

  /** Lookup by exact handle */
  function lookupHandle(handle) {
    if (!cache) return null;
    const h = handle.toLowerCase().replace(/^@/, '').trim();
    for (const [tabKey, tabData] of Object.entries(cache.tabs)) {
      const row = tabData.rows.find((r) => (r.handle || '').toLowerCase() === h);
      if (row) return { ...row, _foundIn: tabKey };
    }
    return null;
  }

  function getStats() {
    if (!cache) return { loaded: false, updatedAt: 0, tabCounts: {} };
    const tabCounts = {};
    for (const [k, v] of Object.entries(cache.tabs)) {
      tabCounts[k] = v.meta?.count || v.rows?.length || 0;
    }
    return { loaded: true, updatedAt: cache.updatedAt, tabCounts };
  }

  return {
    start,
    stop,
    refresh,
    getLeaderboard,
    search,
    lookupHandle,
    getStats,
  };
}
