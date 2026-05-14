/**
 * User State Management
 * Stores per-chat subscriptions, keyword filters, mute lists
 * Persists to data/state.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const STATE_FILE = join(DATA_DIR, 'state.json');

// In-memory state
let users = {}; // chatId -> { subscriptions, filters, mutes }

const DEFAULT_USER = {
  subscriptions: ['twitter', 'square', 'truth'], // event types to receive
  filters: [],    // keyword filters (only notify if text matches)
  mutes: [],      // muted handles (skip events from these)
  nftAlerts: false, // receive NFT mint alerts
  active: true,
};

export function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      const raw = readFileSync(STATE_FILE, 'utf8');
      users = JSON.parse(raw);
      console.log(`[State] Loaded ${Object.keys(users).length} users`);
    }
  } catch (err) {
    console.error('[State] Load failed:', err.message);
    users = {};
  }
}

export function saveState() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(users, null, 2));
  } catch (err) {
    console.error('[State] Save failed:', err.message);
  }
}

function ensureUser(chatId) {
  const id = String(chatId);
  if (!users[id]) {
    users[id] = { ...DEFAULT_USER, subscriptions: [...DEFAULT_USER.subscriptions], filters: [], mutes: [] };
    saveState();
  }
  return users[id];
}

export function getUser(chatId) {
  return ensureUser(chatId);
}

export function setSubscriptions(chatId, subs) {
  const user = ensureUser(chatId);
  user.subscriptions = subs;
  saveState();
}

export function addFilter(chatId, keyword) {
  const user = ensureUser(chatId);
  const kw = keyword.toLowerCase().trim();
  if (!kw || user.filters.includes(kw)) return false;
  user.filters.push(kw);
  saveState();
  return true;
}

export function removeFilter(chatId, keyword) {
  const user = ensureUser(chatId);
  const kw = keyword.toLowerCase().trim();
  const idx = user.filters.indexOf(kw);
  if (idx === -1) return false;
  user.filters.splice(idx, 1);
  saveState();
  return true;
}

export function addMute(chatId, handle) {
  const user = ensureUser(chatId);
  const h = handle.toLowerCase().replace(/^@/, '').trim();
  if (!h || user.mutes.includes(h)) return false;
  user.mutes.push(h);
  saveState();
  return true;
}

export function removeMute(chatId, handle) {
  const user = ensureUser(chatId);
  const h = handle.toLowerCase().replace(/^@/, '').trim();
  const idx = user.mutes.indexOf(h);
  if (idx === -1) return false;
  user.mutes.splice(idx, 1);
  saveState();
  return true;
}

export function setNftAlerts(chatId, enabled) {
  const user = ensureUser(chatId);
  user.nftAlerts = enabled;
  saveState();
}

export function setActive(chatId, active) {
  const user = ensureUser(chatId);
  user.active = active;
  saveState();
}

export function getAllActiveChats() {
  return Object.entries(users)
    .filter(([, u]) => u.active)
    .map(([id, u]) => ({ chatId: id, ...u }));
}

export function shouldNotify(chatId, type, event) {
  const user = ensureUser(chatId);
  if (!user.active) return false;

  // Check subscription
  if (!user.subscriptions.includes(type) && !user.subscriptions.includes('all')) return false;

  // Check mutes
  const handle = (event.twAccount || event.content?.userScreenName || '').toLowerCase();
  if (handle && user.mutes.includes(handle)) return false;

  // Check keyword filters (if any filters set, event must match at least one)
  if (user.filters.length > 0) {
    const text = (event.content?.text || event.content?.fullText || '').toLowerCase();
    const name = (event.content?.userName || '').toLowerCase();
    const combined = `${text} ${name} ${handle}`;
    const matches = user.filters.some((kw) => combined.includes(kw));
    if (!matches) return false;
  }

  return true;
}
