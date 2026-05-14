/**
 * NFT Feed Module
 * Polls /wallet-nft-api/feed for live ETH NFT mints (ERC721/ERC1155)
 * Detects new mints by tracking seen contracts per block, alerts on new entries
 */

import fetch from 'node-fetch';

export function createNftFeed(config) {
  const {
    apiBase,
    intervalMs = 30000,
    onNewMint,
  } = config;

  let timer = null;
  let running = false;
  let lastBlock = 0;
  let seenKeys = new Set(); // "contract:selector:blockNumber"
  let latestFeed = []; // current blocks data for on-demand queries

  async function poll() {
    if (!running) return;
    const url = `${apiBase}/wallet-nft-api/feed`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Monitor88-TelegramBot/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.blocks)) return;

      const newBlock = Number(data.latestBlock || 0);
      const blocks = data.blocks;
      latestFeed = blocks;

      // Detect new mints
      const newMints = [];
      for (const block of blocks) {
        const blockNum = block.number;
        if (!Array.isArray(block.entries)) continue;
        for (const entry of block.entries) {
          const key = `${entry.contract}:${entry.selector}:${blockNum}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          newMints.push({ ...entry, blockNumber: blockNum, blockTimestamp: block.timestamp });
        }
      }

      // Prune old seen keys (keep last 500)
      if (seenKeys.size > 500) {
        const arr = [...seenKeys];
        seenKeys = new Set(arr.slice(arr.length - 300));
      }

      // Only alert on truly new blocks (not first load)
      if (lastBlock > 0 && newMints.length > 0) {
        for (const mint of newMints) {
          if (onNewMint) onNewMint(mint);
        }
      }

      lastBlock = newBlock;
    } catch (err) {
      console.error('[NFT] Poll failed:', err.message);
    }
  }

  function start() {
    if (running) return;
    running = true;
    console.log(`[NFT] Feed started, interval=${intervalMs}ms`);
    poll(); // initial load (won't alert)
    timer = setInterval(poll, intervalMs);
  }

  function stop() {
    running = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  /** Get current feed for on-demand /nft command */
  function getFeed(limit = 10) {
    const entries = [];
    for (const block of latestFeed) {
      for (const entry of block.entries || []) {
        entries.push({ ...entry, blockNumber: block.number, blockTimestamp: block.timestamp });
      }
    }
    // Sort by minted count descending
    entries.sort((a, b) => Number(BigInt(b.minted || '0') - BigInt(a.minted || '0')));
    return entries.slice(0, limit);
  }

  /** Get latest block number */
  function getLatestBlock() {
    return lastBlock;
  }

  function getStats() {
    return { running, lastBlock, feedBlocks: latestFeed.length, seenCount: seenKeys.size };
  }

  return {
    start,
    stop,
    poll,
    getFeed,
    getLatestBlock,
    getStats,
  };
}
