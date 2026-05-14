/**
 * Deduplication Module
 * Tracks seen event keys to prevent duplicate notifications
 * Uses a bounded Set with automatic pruning
 */

const MAX_KEYS = 2000;

export function createDedup() {
  let seen = new Set();

  /** Returns true if event is NEW (not seen before) */
  function isNew(key) {
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    // Prune oldest when too large
    if (seen.size > MAX_KEYS) {
      const arr = [...seen];
      seen = new Set(arr.slice(arr.length - (MAX_KEYS / 2)));
    }
    return true;
  }

  function size() {
    return seen.size;
  }

  function clear() {
    seen.clear();
  }

  return { isNew, size, clear };
}
