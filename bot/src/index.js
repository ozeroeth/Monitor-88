/**
 * Monitor88 Telegram Bot
 * Main entry point — wires SSE, Poller, FOMO, NFT, and Telegram commands together
 */

import 'dotenv/config';
import { createServer } from 'http';
import { Bot } from 'grammy';
import fetch from 'node-fetch';

import { createSSEListener } from './sse.js';
import { createPoller } from './poller.js';
import { createFomoCache } from './fomo.js';
import { createNftFeed } from './nft.js';
import { createDedup } from './dedup.js';
import { formatEvent, formatNftMint, formatFomoLeaderboard, formatWalletLookup } from './formatter.js';
import {
  loadState, saveState, getUser, setSubscriptions, addFilter, removeFilter,
  addMute, removeMute, setNftAlerts, setActive, getAllActiveChats, shouldNotify,
} from './state.js';

// === Config ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_BASE = process.env.API_BASE || 'https://985monitor.xyz';
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL_MS) || 60000;
const NFT_POLL_INTERVAL = Number(process.env.NFT_POLL_INTERVAL_MS) || 30000;
const FOMO_INTERVAL = Number(process.env.FOMO_CACHE_INTERVAL_MS) || 3600000;
const SSE_RECONNECT = Number(process.env.SSE_RECONNECT_DELAY_MS) || 5000;
const ALLOWED_CHATS = (process.env.ALLOWED_CHAT_IDS || '').split(',').filter(Boolean);

if (!BOT_TOKEN) {
  console.error('ERROR: BOT_TOKEN not set in .env');
  process.exit(1);
}

// === Init ===
const bot = new Bot(BOT_TOKEN);
const dedup = createDedup();
loadState();

// === Access control ===
function isAllowed(chatId) {
  if (ALLOWED_CHATS.length === 0) return true;
  return ALLOWED_CHATS.includes(String(chatId));
}

// === Broadcast event to all subscribed chats ===
async function broadcast(type, event) {
  const key = event.key || `${type}:${event.content?.id || Date.now()}`;
  if (!dedup.isNew(key)) return;

  const message = formatEvent(type, event);
  const chats = getAllActiveChats();

  for (const chat of chats) {
    if (!isAllowed(chat.chatId)) continue;
    if (!shouldNotify(chat.chatId, type, event)) continue;
    try {
      await bot.api.sendMessage(chat.chatId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    } catch (err) {
      if (err.error_code === 403) {
        // Bot was blocked by user
        setActive(chat.chatId, false);
      }
      // Ignore other send errors (rate limit, etc)
    }
  }
}

async function broadcastNft(entry) {
  const message = formatNftMint(entry);
  const chats = getAllActiveChats();

  for (const chat of chats) {
    if (!isAllowed(chat.chatId)) continue;
    if (!chat.nftAlerts) continue;
    try {
      await bot.api.sendMessage(chat.chatId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    } catch (err) {
      if (err.error_code === 403) setActive(chat.chatId, false);
    }
  }
}

// === SSE ===
const sse = createSSEListener({
  apiBase: API_BASE,
  reconnectDelay: SSE_RECONNECT,
  onEvent: (type, event) => broadcast(type, event),
  onStatus: (s) => console.log(`[SSE] State: ${s.state}`),
});

// === Poller ===
const poller = createPoller({
  apiBase: API_BASE,
  intervalMs: POLL_INTERVAL,
  onEvent: (type, event) => broadcast(type, event),
  getSseState: () => sse.getState(),
});

// === FOMO ===
const fomo = createFomoCache({
  apiBase: API_BASE,
  intervalMs: FOMO_INTERVAL,
});

// === NFT ===
const nftFeed = createNftFeed({
  apiBase: API_BASE,
  intervalMs: NFT_POLL_INTERVAL,
  onNewMint: (entry) => broadcastNft(entry),
});

// === Bot Commands ===

bot.command('start', async (ctx) => {
  if (!isAllowed(ctx.chat.id)) return;
  getUser(ctx.chat.id); // ensure user exists
  await ctx.reply(
    `🤖 <b>Monitor88 Bot</b>\n\n` +
    `Realtime crypto alerts from 985monitor.xyz\n\n` +
    `<b>Commands:</b>\n` +
    `/status — System health\n` +
    `/subscribe — Manage subscriptions\n` +
    `/filter — Keyword filters\n` +
    `/mute — Mute handles\n` +
    `/watchlist — Monitored accounts\n` +
    `/token 0x... — DEX token info\n` +
    `/nft — Latest NFT mints\n` +
    `/fomo [24h|7d|30d|all] — KOL leaderboard\n` +
    `/wallet @handle — Lookup KOL wallets\n` +
    `/stop — Pause notifications\n` +
    `/resume — Resume notifications`,
    { parse_mode: 'HTML' }
  );
});

bot.command('status', async (ctx) => {
  if (!isAllowed(ctx.chat.id)) return;
  try {
    const res = await fetch(`${API_BASE}/api/monitor-health`, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    const sseState = sse.getState();
    const pollerStats = poller.getStats();
    const fomoStats = fomo.getStats();
    const nftStats = nftFeed.getStats();

    const tw = data.twitter || {};
    const sq = data.square || {};
    const tr = data.truth || {};

    const ago = (ms) => ms ? `${Math.round((Date.now() - ms) / 1000)}s ago` : 'never';

    await ctx.reply(
      `📡 <b>System Status</b>\n\n` +
      `<b>985monitor Backend:</b>\n` +
      `  Twitter WSS: ${tw.wssOpen ? '🟢' : '🔴'} | Last: ${ago(tw.lastEventAt)}\n` +
      `  Square: Last ${ago(sq.lastEventAt)}\n` +
      `  Truth: Last ${ago(tr.lastEventAt)}\n\n` +
      `<b>Bot Internals:</b>\n` +
      `  SSE: ${sseState.state === 'open' ? '🟢' : '🟡'} ${sseState.state}\n` +
      `  Poller: polls=${pollerStats.pollCount}\n` +
      `  Dedup: ${dedup.size()} keys\n` +
      `  FOMO: ${fomoStats.loaded ? '🟢' : '⏳'} tabs=${Object.keys(fomoStats.tabCounts).length}\n` +
      `  NFT: ${nftStats.running ? '🟢' : '🔴'} block=${nftStats.lastBlock}`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    await ctx.reply(`❌ Status check failed: ${err.message}`);
  }
});

bot.command('subscribe', async (ctx) => {
  if (!isAllowed(ctx.chat.id)) return;
  const args = ctx.match?.trim().toLowerCase();
  const user = getUser(ctx.chat.id);
  const VALID = ['all', 'twitter', 'square', 'truth', 'news', 'alpha'];

  if (!args) {
    await ctx.reply(
      `📬 <b>Your Subscriptions:</b> ${user.subscriptions.join(', ') || 'none'}\n\n` +
      `Usage: /subscribe all|twitter|square|truth|news|alpha\n` +
      `Example: /subscribe twitter,square\n` +
      `Use /subscribe all for everything`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const subs = args.split(/[,\s]+/).filter((s) => VALID.includes(s));
  if (subs.length === 0) {
    await ctx.reply(`❌ Invalid. Choose from: ${VALID.join(', ')}`);
    return;
  }
  setSubscriptions(ctx.chat.id, subs);
  await ctx.reply(`✅ Subscriptions updated: <b>${subs.join(', ')}</b>`, { parse_mode: 'HTML' });
});

bot.command('filter', async (ctx) => {
  if (!isAllowed(ctx.chat.id)) return;
  const args = ctx.match?.trim();
  const user = getUser(ctx.chat.id);

  if (!args) {
    const list = user.filters.length ? user.filters.map((f) => `• ${f}`).join('\n') : 'None (all events pass)';
    await ctx.reply(
      `🔍 <b>Keyword Filters:</b>\n${list}\n\n` +
      `Usage:\n/filter add &lt;keyword&gt;\n/filter remove &lt;keyword&gt;\n/filter clear`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const [action, ...rest] = args.split(' ');
  const keyword = rest.join(' ').trim();

  if (action === 'add' && keyword) {
    const ok = addFilter(ctx.chat.id, keyword);
    await ctx.reply(ok ? `✅ Filter added: <b>${keyword}</b>` : `⚠️ Already exists.`, { parse_mode: 'HTML' });
  } else if (action === 'remove' && keyword) {
    const ok = removeFilter(ctx.chat.id, keyword);
    await ctx.reply(ok ? `✅ Filter removed: <b>${keyword}</b>` : `⚠️ Not found.`, { parse_mode: 'HTML' });
  } else if (action === 'clear') {
    const user2 = getUser(ctx.chat.id);
    user2.filters = [];
    saveState();
    await ctx.reply(`✅ All filters cleared.`);
  } else {
    await ctx.reply(`Usage: /filter add|remove|clear &lt;keyword&gt;`, { parse_mode: 'HTML' });
  }
});

bot.command('mute', async (ctx) => {
  if (!isAllowed(ctx.chat.id)) return;
  const args = ctx.match?.trim();
  const user = getUser(ctx.chat.id);

  if (!args) {
    const list = user.mutes.length ? user.mutes.map((m) => `• @${m}`).join('\n') : 'None';
    await ctx.reply(
      `🔇 <b>Muted Handles:</b>\n${list}\n\n` +
      `Usage:\n/mute @handle — mute\n/unmute @handle — unmute`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const ok = addMute(ctx.chat.id, args);
  await ctx.reply(ok ? `✅ Muted: @${args.replace(/^@/, '')}` : `⚠️ Already muted.`);
});

bot.command('unmute', async (ctx) => {
  if (!isAllowed(ctx.chat.id)) return;
  const args = ctx.match?.trim();
  if (!args) { await ctx.reply('Usage: /unmute @handle'); return; }
  const ok = removeMute(ctx.chat.id, args);
  await ctx.reply(ok ? `✅ Unmuted: @${args.replace(/^@/, '')}` : `⚠️ Not in mute list.`);
});

bot.command('watchlist', async (ctx) => {
  if (!isAllowed(ctx.chat.id)) return;
  try {
    const res = await fetch(`${API_BASE}/api/watch-config`, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    const config = data.config || {};
    const twAccounts = config.twitter || [];
    const sqAccounts = config.square || [];

    let text = `👁 <b>Monitored Accounts</b>\n\n`;
    text += `<b>Twitter (${twAccounts.length}):</b>\n`;
    text += twAccounts.slice(0, 30).map((a) => {
      const h = typeof a === 'string' ? a : a.handle;
      const name = typeof a === 'object' ? a.displayName || '' : '';
      return `• @${h}${name ? ` (${name})` : ''}`;
    }).join('\n');
    if (twAccounts.length > 30) text += `\n… and ${twAccounts.length - 30} more`;

    text += `\n\n<b>Binance Square (${sqAccounts.length}):</b>\n`;
    text += sqAccounts.map((a) => {
      const h = typeof a === 'string' ? a : a.handle;
      return `• ${h}`;
    }).join('\n');

    await ctx.reply(text, { parse_mode: 'HTML' });
  } catch (err) {
    await ctx.reply(`❌ Failed: ${err.message}`);
  }
});

bot.command('token', async (ctx) => {
  if (!isAllowed(ctx.chat.id)) return;
  const ca = ctx.match?.trim();
  if (!ca || !ca.startsWith('0x')) {
    await ctx.reply('Usage: /token 0x... (contract address)');
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/api/dex-token-info?ca=${encodeURIComponent(ca)}`, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    if (!data.ok || !data.data) {
      await ctx.reply('❌ Token not found or API error.');
      return;
    }
    const d = data.data;
    const price = d.priceUsd ? `$${Number(d.priceUsd).toPrecision(4)}` : '?';
    const mcap = d.marketCap ? `$${(d.marketCap / 1e6).toFixed(2)}M` : '?';
    const liq = d.liquidity ? `$${(d.liquidity / 1000).toFixed(1)}K` : '?';
    const vol = d.volume24h ? `$${(d.volume24h / 1000).toFixed(1)}K` : '?';

    await ctx.reply(
      `🪙 <b>${d.name || '?'}</b> (${d.symbol || '?'})\n\n` +
      `💰 Price: ${price}\n` +
      `📊 MCap: ${mcap}\n` +
      `💧 Liquidity: ${liq}\n` +
      `📈 Volume 24h: ${vol}\n` +
      `🔗 Chain: ${d.chainId || '?'} | DEX: ${d.dexId || '?'}\n` +
      (d.pairUrl ? `\n<a href="${d.pairUrl}">DexScreener</a>` : ''),
      { parse_mode: 'HTML', disable_web_page_preview: true }
    );
  } catch (err) {
    await ctx.reply(`❌ Error: ${err.message}`);
  }
});

bot.command('nft', async (ctx) => {
  if (!isAllowed(ctx.chat.id)) return;
  const arg = ctx.match?.trim().toLowerCase();

  if (arg === 'on') {
    setNftAlerts(ctx.chat.id, true);
    await ctx.reply('✅ NFT mint alerts enabled. You will get notified of new mints.');
    return;
  }
  if (arg === 'off') {
    setNftAlerts(ctx.chat.id, false);
    await ctx.reply('🔕 NFT mint alerts disabled.');
    return;
  }

  const entries = nftFeed.getFeed(10);
  if (!entries.length) {
    await ctx.reply('⏳ No NFT mints detected yet. Wait for data...\n\nUse /nft on to enable push alerts.');
    return;
  }

  let text = `🎨 <b>Latest NFT Mints (ETH)</b>\nBlock: ${nftFeed.getLatestBlock()}\n\n`;
  for (const entry of entries.slice(0, 8)) {
    const short = entry.contract ? `${entry.contract.slice(0, 8)}…` : '?';
    text += `• <b>${entry.name || 'Unknown'}</b> <code>${short}</code> — x${entry.minted} ${entry.standard || ''}\n`;
  }
  text += `\nUse /nft on|off to toggle realtime alerts.`;
  await ctx.reply(text, { parse_mode: 'HTML' });
});

bot.command('fomo', async (ctx) => {
  if (!isAllowed(ctx.chat.id)) return;
  const tab = ctx.match?.trim().toLowerCase() || '24h';
  const validTabs = ['24h', '7d', '30d', 'all', 'social'];
  if (!validTabs.includes(tab)) {
    await ctx.reply(`Usage: /fomo [${validTabs.join('|')}]`);
    return;
  }
  const data = fomo.getLeaderboard(tab, 10);
  if (!data) {
    await ctx.reply('⏳ FOMO data loading... try again in a minute.');
    return;
  }
  const text = formatFomoLeaderboard(data, tab);
  await ctx.reply(text, { parse_mode: 'HTML', disable_web_page_preview: true });
});

bot.command('wallet', async (ctx) => {
  if (!isAllowed(ctx.chat.id)) return;
  const query = ctx.match?.trim();
  if (!query) {
    await ctx.reply('Usage: /wallet @handle or /wallet 0x...\nLooks up KOL real wallets from FOMO data.');
    return;
  }
  const row = fomo.lookupHandle(query) || fomo.search(query)?.[0];
  const text = formatWalletLookup(row);
  await ctx.reply(text, { parse_mode: 'HTML', disable_web_page_preview: true });
});

bot.command('stop', async (ctx) => {
  if (!isAllowed(ctx.chat.id)) return;
  setActive(ctx.chat.id, false);
  await ctx.reply('⏸ Notifications paused. Use /resume to re-enable.');
});

bot.command('resume', async (ctx) => {
  if (!isAllowed(ctx.chat.id)) return;
  setActive(ctx.chat.id, true);
  await ctx.reply('▶️ Notifications resumed!');
});

// === Minimal HTTP health server (for Koyeb/Railway/Render health checks) ===

function startHealthServer() {
  const port = Number(process.env.PORT) || 8000;
  const server = createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      const sseState = sse.getState();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        sse: sseState.state,
        dedup: dedup.size(),
        fomo: fomo.getStats().loaded,
        nft: nftFeed.getStats().lastBlock,
        uptime: process.uptime(),
      }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  server.listen(port, () => {
    console.log(`[Health] HTTP server on port ${port}`);
  });
}

// === Start everything ===
async function main() {
  console.log('🚀 Monitor88 Bot starting...');
  console.log(`   API: ${API_BASE}`);
  console.log(`   Poll: ${POLL_INTERVAL}ms | NFT: ${NFT_POLL_INTERVAL}ms | FOMO: ${FOMO_INTERVAL}ms`);

  // Health server for cloud platforms (Koyeb, Railway, Render)
  startHealthServer();

  // Start data sources
  sse.connect();
  poller.start();
  fomo.start();
  nftFeed.start();

  // Start bot
  bot.start({
    onStart: (info) => console.log(`✅ Bot @${info.username} is running!`),
  });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
